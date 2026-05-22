---
name: unsealing-vault
description: >
  Use this skill when HashiCorp Vault needs to be unsealed after a pod restart,
  crash, or cluster failover. Trigger on any of: Vault returning HTTP 503, a
  `vault status` check showing `Sealed: true`, a PagerDuty or Alertmanager
  alert for vault_core_unsealed == 0, or an engineer asking how to unseal Vault,
  recover Vault access, or diagnose Vault seal errors. Covers both auto-unseal
  failure diagnosis (Transit seal, Cloud KMS) and the full manual Shamir
  3-of-5 unseal path, including HA clusters with multiple sealed pods and
  post-unseal Raft health verification.
---

# Unsealing HashiCorp Vault

Structured runbook for restoring Vault to an unsealed, operational state after
a pod restart, crash, or sealed-state alert.

## Instructions

When this skill is invoked, follow these steps:

### Step 1 — Confirm the sealed state

Run `vault status` and inspect the output.

```
vault status
```

Look for the line:

```
Sealed          true
```

If `Sealed: false`, Vault is already operational. Stop here and tell the
engineer the cluster is healthy; suggest checking application connectivity
instead.

If `Sealed: true`, continue to Step 2.

---

### Step 2 — Determine whether auto-unseal was configured

Check the Vault pod logs for seal-related errors before attempting manual
intervention:

```bash
kubectl logs -n vault vault-0 --tail=100 | grep -i "seal\|unseal\|kms\|transit"
```

#### 2a — Transit auto-unseal failure

If the logs reference a Transit seal backend:

1. Verify the transit Vault cluster is reachable from the sealed pod:
   ```bash
   kubectl exec -n vault vault-0 -- vault status --address=<TRANSIT_VAULT_ADDR>
   ```
2. Confirm the transit token is valid and has not expired:
   ```bash
   kubectl exec -n vault vault-0 -- \
     vault token lookup --address=<TRANSIT_VAULT_ADDR>
   ```
3. If the token is invalid or expired, rotate it via the transit Vault's token
   management and update the Kubernetes secret that Vault mounts:
   ```bash
   kubectl -n vault edit secret vault-transit-token
   # update the token value, then restart the pod
   kubectl -n vault rollout restart statefulset vault
   ```
4. Once connectivity and token validity are confirmed, Vault should
   auto-unseal on the next startup. Monitor the logs:
   ```bash
   kubectl logs -n vault vault-0 -f
   ```
   Proceed to Step 5 to verify.

#### 2b — Cloud KMS auto-unseal failure

If the logs reference a KMS backend (AWS KMS, GCP Cloud KMS, Azure Key Vault):

1. Verify IAM/service-account permissions for the Vault pod's identity.
   - AWS: confirm the pod's IAM role has `kms:Decrypt` and `kms:DescribeKey` on
     the target KMS key ARN.
   - GCP: confirm the service account has `cloudkms.cryptoKeyVersions.useToDecrypt`.
   - Azure: confirm the managed identity has `unwrapKey` on the Key Vault key.
2. Test network connectivity from the pod to the KMS endpoint:
   ```bash
   kubectl exec -n vault vault-0 -- \
     curl -sf https://kms.<region>.amazonaws.com  # adjust endpoint per cloud
   ```
3. If IAM or network is the root cause, fix at the infrastructure level (Terraform,
   IAM policy, security group, VPC endpoint) and restart the pod.
4. Once resolved, monitor auto-unseal in the logs and continue to Step 5.

If auto-unseal cannot be restored quickly and downtime must be minimised,
fall through to the manual unseal path (Step 3).

---

### Step 3 — Manual unseal (3-of-5 Shamir key shares)

> This path requires co-ordination across at least three key-share holders.
> Never request more than one key share from any single operator.

**Operator 1** runs:
```bash
vault operator unseal
# enter key share 1 when prompted
```

**Operator 2** runs (can be on any workstation with Vault CLI access):
```bash
vault operator unseal
# enter key share 2
```

**Operator 3** runs:
```bash
vault operator unseal
# enter key share 3
```

After each `unseal` call, output will show the remaining threshold:

```
Unseal Progress     2/3
```

When the threshold is met, output will show:

```
Sealed              false
```

---

### Step 4 — Unseal additional pods in an HA cluster

For clusters with 3 replicas, every sealed pod must be independently unsealed.
Repeat the 3-of-5 process for `vault-1` and `vault-2` using `kubectl exec`:

```bash
# Key-share holder 1
kubectl exec -n vault vault-1 -- vault operator unseal <KEY_SHARE_1>

# Key-share holder 2
kubectl exec -n vault vault-1 -- vault operator unseal <KEY_SHARE_2>

# Key-share holder 3
kubectl exec -n vault vault-1 -- vault operator unseal <KEY_SHARE_3>
```

Repeat for `vault-2`:

```bash
kubectl exec -n vault vault-2 -- vault operator unseal <KEY_SHARE_1>
kubectl exec -n vault vault-2 -- vault operator unseal <KEY_SHARE_2>
kubectl exec -n vault vault-2 -- vault operator unseal <KEY_SHARE_3>
```

Verify each pod's sealed state before moving on:

```bash
for pod in vault-0 vault-1 vault-2; do
  echo "--- $pod ---"
  kubectl exec -n vault $pod -- vault status | grep -E "Sealed|HA Mode|Active"
done
```

---

### Step 5 — Post-unseal health verification

Confirm the Raft cluster has re-formed with all peers:

```bash
vault operator raft list-peers
```

Expected output shows all nodes with `voter` status and one node as `leader`:

```
Node       Address                        State       Voter
----       -------                        -----       -----
vault-0    vault-0.vault-internal:8201    leader      true
vault-1    vault-1.vault-internal:8201    follower    true
vault-2    vault-2.vault-internal:8201    follower    true
```

If any node is missing from the peer list, check its logs:

```bash
kubectl logs -n vault <pod-name> --tail=50
```

---

### Step 6 — Root cause and follow-up action

| Scenario | Required action |
|---|---|
| First-time manual unseal after pod restart | Implement auto-unseal immediately (see below) |
| Auto-unseal worked but was slow | Check KMS endpoint latency; consider a VPC endpoint |
| Repeated manual unseals in production | Escalate to platform team — SLO breach |

**To enable auto-unseal via Transit seal (Helm):** add the following to your
Vault Helm `values.yaml` and re-deploy:

```yaml
server:
  ha:
    enabled: true
  extraEnvironmentVars:
    VAULT_SEAL_TYPE: transit
  volumes:
    - name: transit-token
      secret:
        secretName: vault-transit-token
  volumeMounts:
    - mountPath: /vault/transit-token
      name: transit-token
  config: |
    seal "transit" {
      address            = "https://<TRANSIT_VAULT_ADDR>"
      token_file         = "/vault/transit-token/token"
      disable_renewal    = "false"
      key_name           = "autounseal"
      mount_path         = "transit/"
    }
```

---

## Examples

**Scenario: On-call alert fires — `vault_core_unsealed == 0`**

```bash
# 1. Confirm
vault status | grep Sealed
# Sealed: true

# 2. Check logs for auto-unseal errors
kubectl logs -n vault vault-0 --tail=100 | grep -i seal

# 3. If no auto-unseal configured, coordinate 3-of-5 unseal
vault operator unseal   # operator 1
vault operator unseal   # operator 2
vault operator unseal   # operator 3

# 4. HA: repeat for vault-1, vault-2
kubectl exec -n vault vault-1 -- vault operator unseal <share1>
# ... (shares 2 and 3)

# 5. Verify
vault operator raft list-peers
```

**Scenario: Transit token expired — auto-unseal broken after certificate rotation**

```bash
kubectl exec -n vault vault-0 -- vault token lookup --address=https://transit.vault.internal
# Error: token not found

# Rotate token, update secret, restart pod
kubectl -n vault patch secret vault-transit-token \
  -p '{"data":{"token":"<base64-encoded-new-token>"}}'
kubectl -n vault rollout restart statefulset vault
kubectl logs -n vault vault-0 -f | grep -i unseal
```

---

## Best Practices

- Never store unseal key shares in plaintext. Distribute them across at least
  three operators using Shamir secret sharing, and store each share in a
  separate secrets manager or HSM.
- Configure auto-unseal on every production Vault cluster. Requiring manual
  key-share coordination during an incident guarantees extended downtime.
- Monitor the `vault_core_unsealed` Prometheus metric and alert immediately
  when it drops to `0`. Do not wait for application-layer 503 errors to surface
  the problem.
- Rotate auto-unseal credentials (Transit tokens, KMS key policies) on a
  schedule and verify rotation does not break the unseal path in a staging
  environment before applying to production.
- In HA deployments, unseal all standby pods promptly after a restart — a
  partially unsealed cluster reduces fault tolerance.
- Document which operators hold which key shares in a secure, access-controlled
  location (e.g., a restricted Confluence page or a separate secrets vault).
  Treat this list as a critical secret.
- After any manual unseal event, schedule a post-incident review to determine
  why auto-unseal was unavailable and ensure it is remediated before the next
  incident.
