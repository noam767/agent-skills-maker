---
name: unsealing-vault
description: Use this skill when a Penta Vault pod is sealed after a restart, node replacement, or cluster recovery. Walks the unseal flow with the standard 3-of-5 Shamir shares and the audit-trail expectations.
---

# Unsealing Vault (team Penta)

Restores a sealed Vault pod to operational state using the documented Shamir 3-of-5 share threshold.

## Instructions

When this skill is invoked, follow these steps:

1. **Confirm the pod is sealed**:
   ```bash
   kubectl exec -n vault <pod> -- vault status
   ```
   `Sealed: true` confirms the state. `Initialized: false` means a different procedure (initialize, not unseal).
2. **Coordinate share holders** — unsealing requires 3 of 5 share holders to each apply their share. Page the rotation list; do not start until 3 are online.
3. **Each share holder runs**:
   ```bash
   kubectl exec -n vault <pod> -i -- vault operator unseal
   # paste the share when prompted
   ```
   After the third successful share, the pod returns to `Sealed: false`.
4. **Verify**:
   ```bash
   kubectl exec -n vault <pod> -- vault status
   # Should show Sealed: false, HA Mode: active (or standby for the secondaries)
   ```
5. **For HA**: repeat for every sealed pod. The cluster needs an active leader before secondaries can join.
6. **Audit trail** — log the incident channel timestamp, which 3 share holders unsealed, and which pod(s). This is non-negotiable for compliance.
7. **Hard refusals**:
   - Do NOT collect all 3 shares into one place to "speed it up". Each holder applies their own share via their own session.
   - Do NOT use the root token to bypass — root usage requires a separate process.

## Best Practices

- Operate fully offline — flag missing dependencies rather than fetching them.
- The unseal is per-pod, not per-cluster. Every restarted pod needs the threshold applied.
- Treat unseal as an audited event; document share-holders involved in the incident channel.

## Grounding sources

- *Vault Guide* — Confluence space PENTA
