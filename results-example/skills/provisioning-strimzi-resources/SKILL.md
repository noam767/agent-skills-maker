---
name: provisioning-strimzi-resources
description: >
  Use this skill when a user needs to provision Kafka resources on a Strimzi-managed
  cluster. Triggers include: creating a new Kafka topic, generating a KafkaTopic
  manifest, provisioning a Kafka user or service account with ACLs, scaffolding
  Strimzi custom resources (CRs), setting topic retention or partition counts,
  wiring SCRAM-SHA-512 authentication, or applying Team Penta's Kafka configuration
  standards to any new topic or user resource. Also invoke when a user asks for a
  kubectl apply workflow for Strimzi KafkaTopic or KafkaUser objects.
---

# Provisioning Strimzi Resources

Generates ready-to-apply Strimzi `KafkaTopic` and `KafkaUser` Kubernetes manifests
that conform to Team Penta's Kafka configuration standards.

## Instructions

When this skill is invoked, follow these steps:

### Step 1 — Gather Required Parameters

Ask the user (or infer from context) for the following inputs. Do not proceed to
manifest generation until every required field is resolved.

**Topic parameters (required):**
- `topic-name` — must follow the naming convention `<team>.<service>.<event-type>`
  (e.g., `penta.billing.invoice-created`). Reject names that do not match this pattern
  and explain why.
- `cluster` — the value for the `strimzi.io/cluster` label (e.g., `my-cluster`).
- `partitions` — number of partitions. Ask the user to justify values above 32.
- `replicas` — replication factor. **Minimum 3 in any production namespace.**
- `retention-ms` — log retention in milliseconds. Default: `604800000` (7 days).
  Accept human-friendly aliases: `7d` → `604800000`, `1d` → `86400000`, `30d` → `2592000000`.
- `segment-bytes` — log segment size in bytes. Default: `1073741824` (1 GiB).

**User/ACL parameters (optional — ask only when access provisioning is requested):**
- `username` — Kubernetes resource name for the `KafkaUser`.
- `acl-operations` — list of ACL verbs needed per topic: `Read`, `Write`, `Describe`.
  Default to the minimum required; never auto-grant `All`.

---

### Step 2 — Validate Against Team Penta Standards

Before generating any YAML, enforce the following rules. Surface violations as
clearly labeled warnings or hard stops.

| Rule | Check | Action |
|------|-------|--------|
| Replication factor | `replicas >= 3` | Hard stop in production; warn in non-prod |
| Topic naming | matches `<team>.<service>.<event-type>` | Hard stop — rename before continuing |
| Unclean leader election | must be disabled | Always set `unclean.leader.election.enable=false` |
| Min ISR reminder | `min.insync.replicas = replicas - 1` | This is set in **cluster** config, not in the topic CR; remind the user |
| ACL scope | no `All` or wildcard operations | Hard stop — scope to explicit verbs only |

---

### Step 3 — Generate KafkaTopic Manifest

Emit the following YAML, substituting all `<placeholder>` values:

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: <topic-name>
  labels:
    strimzi.io/cluster: <cluster>
spec:
  partitions: <partitions>
  replicas: <replicas>
  config:
    retention.ms: "<retention-ms>"
    segment.bytes: "<segment-bytes>"
    unclean.leader.election.enable: "false"
```

Notes on this manifest:
- `config` values must be strings (quoted) — the Strimzi operator rejects bare integers
  for these fields.
- `replicas` maps to Kafka's `replication.factor` for the topic.
- Do not set `min.insync.replicas` here; it belongs in the `Kafka` cluster CR under
  `spec.kafka.config`. Remind the user to verify it is set to `replicas - 1` on the
  cluster resource.

---

### Step 4 — Generate KafkaUser Manifest (when access is requested)

If the user needs a Kafka principal for a service, emit the following YAML. ACL
entries are emitted per topic per operation — do not collapse them into wildcard
resources.

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaUser
metadata:
  name: <username>
  labels:
    strimzi.io/cluster: <cluster>
spec:
  authentication:
    type: scram-sha-512
  authorization:
    type: simple
    acls:
      # Repeat one block per (topic, operation) pair
      - resource:
          type: topic
          name: <topic-name>
          patternType: literal
        operation: Read
        host: "*"
      - resource:
          type: topic
          name: <topic-name>
          patternType: literal
        operation: Describe
        host: "*"
      # Add Write block only if Write access is explicitly requested:
      # - resource:
      #     type: topic
      #     name: <topic-name>
      #     patternType: literal
      #   operation: Write
      #   host: "*"
      # Consumer group ACL — required for consumer services:
      - resource:
          type: group
          name: <username>
          patternType: prefix
        operation: Read
        host: "*"
```

Notes on this manifest:
- `scram-sha-512` is Team Penta's required authentication type. Do not use `tls` or
  `plain` unless the user provides explicit justification and cluster-level support is
  confirmed.
- The Strimzi operator creates a Kubernetes `Secret` named `<username>` in the same
  namespace containing the SCRAM credentials. Remind the user to reference this secret
  in their application's environment config.
- Restrict `host` to `"*"` unless the user specifies a CIDR or hostname; document
  this as a permissive default.
- Consumer services always need both a `topic` ACL and a `group` ACL. Include the
  group block automatically when `Read` is in the requested operations.

---

### Step 5 — Emit kubectl Apply Commands

After generating the manifests, output the exact commands the user must run.
Always apply `KafkaTopic` before `KafkaUser`.

```bash
# 1. Save the manifests (adjust filenames as needed)
# kafka-topic-<topic-name>.yaml
# kafka-user-<username>.yaml   (if a KafkaUser was generated)

# 2. Apply the topic first — the operator must reconcile it before users can bind ACLs
kubectl apply -f kafka-topic-<topic-name>.yaml

# 3. Apply the user (if generated)
kubectl apply -f kafka-user-<username>.yaml

# 4. Watch reconciliation status
kubectl get kafkatopic <topic-name> -o jsonpath='{.status.conditions}' | jq .
kubectl get kafkauser <username>    -o jsonpath='{.status.conditions}' | jq .
```

Remind the user:
- Strimzi reconciles **asynchronously**. The topic and user may take 10–60 seconds to
  appear as `Ready` depending on cluster load.
- If `status.conditions` shows `NotReady`, check Strimzi operator logs:
  `kubectl logs -n <operator-namespace> -l name=strimzi-cluster-operator --tail=100`

---

### Step 6 — Final Checklist

Before closing, confirm the following with the user:

- [ ] `strimzi.io/cluster` label matches the name of the target `Kafka` CR in the cluster.
- [ ] `min.insync.replicas` is set to `replicas - 1` in the cluster-level `Kafka` CR.
- [ ] The application secret (`<username>`) will be mounted or injected correctly.
- [ ] If upgrading the Strimzi operator, the correct operator version is pinned — never
      skip minor versions during a Strimzi upgrade path.

---

## Examples

**Example 1 — New topic only**

User request: "Create a topic called `penta.payments.charge-completed` on the
`prod-cluster` with 12 partitions, replication 3, and 14-day retention."

Generated KafkaTopic excerpt:
```yaml
metadata:
  name: penta.payments.charge-completed
  labels:
    strimzi.io/cluster: prod-cluster
spec:
  partitions: 12
  replicas: 3
  config:
    retention.ms: "1209600000"
    segment.bytes: "1073741824"
    unclean.leader.election.enable: "false"
```

**Example 2 — Topic plus consumer user**

User request: "Same topic as above, plus a KafkaUser `payments-consumer-svc` that
can read and describe but not write."

The skill emits both manifests, includes a `group` ACL for `payments-consumer-svc`,
omits the `Write` ACL block, and outputs the two-step `kubectl apply` sequence.

**Example 3 — Naming violation caught**

User request: "Create a topic named `my_topic` on `dev-cluster`."

Skill response: Hard stop. The name `my_topic` does not conform to Team Penta's
`<team>.<service>.<event-type>` convention. Provide a compliant name such as
`penta.myservice.my-event` before proceeding.

---

## Best Practices

- Use the naming convention `<team>.<service>.<event-type>` for every topic. This
  convention enables namespace-style ACL prefix matching and makes ownership obvious.
- Set `replicas` to at least 3 in all production clusters. A replication factor of 1
  or 2 creates a single point of failure for that topic's data.
- Always set `unclean.leader.election.enable=false`. Allowing unclean elections risks
  data loss when a lagging replica is elected leader.
- Verify `min.insync.replicas = replicas - 1` on the cluster `Kafka` CR before
  applying topics. Without this, producers using `acks=all` may succeed writes that
  are not durably replicated.
- Scope `KafkaUser` ACLs to the minimum operations the service actually needs.
  Never grant `All` or use prefix wildcards that span multiple topics unless explicitly
  reviewed and documented.
- Never skip Strimzi operator minor versions during upgrades. Follow the upgrade path
  documented in the Strimzi release notes for the target version — out-of-order upgrades
  can leave CRDs in an inconsistent state.
- Treat SCRAM credentials (the generated `Secret`) as sensitive. Ensure they are
  injected via Kubernetes `envFrom` or a secrets manager integration, never hardcoded
  in application config maps.
- Always apply `KafkaTopic` before `KafkaUser`. The operator's ACL binding logic
  references the topic resource; applying in reverse order may cause transient
  reconciliation errors that require manual re-trigger.
- Use `kubectl get kafkatopic` and `kubectl get kafkauser` to confirm `Ready` status
  after applying. Do not assume the resource is active just because `kubectl apply`
  succeeded — the operator reconciliation is asynchronous.
