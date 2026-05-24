---
name: draining-eks-node-safely
description: Use this skill when a Penta EKS node needs to be taken out of service for upgrade, hardware retirement, or instance type change. Covers cordon-before-drain, PDB checks, AZ-bound PVC handling for stateful pods, and the edge-case recovery for stuck finalizers.
---

# Draining a Penta EKS node safely

Standard cordon → drain → verify procedure with the stateful-workload pitfalls baked in.

## Instructions

When this skill is invoked, follow these steps:

1. **Pre-flight**:
   ```bash
   kubectl get pdb -A | grep -v ALLOWED-DISRUPTIONS
   # Confirm autoscaler healthy:
   kubectl describe deploy cluster-autoscaler -n kube-system | grep Conditions -A3
   ```
2. **Identify stateful workload exposure** — does the node host a Kafka broker, Sentinel pod, Vault pod, or other AZ-bound PVC consumer? If yes:
   - Pre-warm the replacement node in the SAME AZ (autoscaler will not magic one up across AZs for the PVC).
   - For Sentinel — ensure 2 of 3 sentinels remain reachable throughout.
   - For Kafka — verify the broker can lose this replica without dropping below ISR.
3. **Cordon first**:
   ```bash
   kubectl cordon <node>
   ```
   Verify: `kubectl get node <node>` shows `SchedulingDisabled`.
4. **Drain second**:
   ```bash
   kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --grace-period=120
   ```
   In another terminal, watch evictions:
   ```bash
   kubectl get events --field-selector involvedObject.name=<node> -w
   ```
5. **Verify empty**:
   ```bash
   kubectl get pods -A -o wide --field-selector spec.nodeName=<node>
   ```
   Should show DaemonSets only.
6. **Edge cases** — see `./reference/drain-edge-cases.md` for: stuck terminating pods (finalizer hang), PVC-bound stateful pods refusing to evict, taint conflicts.
7. **Hard refusals**:
   - No `--force --delete-emptydir-data --grace-period=0` in prod. Ever.
   - No drain without `--ignore-daemonsets`.
   - No patching of stuck pod finalizers without first confirming the owning controller has done its work.

## Examples

```bash
# Full sequence for a stateless-only node:
kubectl cordon ip-10-0-1-42.ec2.internal
kubectl drain ip-10-0-1-42.ec2.internal \
  --ignore-daemonsets --delete-emptydir-data --grace-period=120
kubectl get pods -A -o wide \
  --field-selector spec.nodeName=ip-10-0-1-42.ec2.internal
```

## Bundle layout

```
draining-eks-node-safely/
  SKILL.md
  reference/
    drain-edge-cases.md
```

## Best Practices

- Operate fully offline — flag missing dependencies rather than fetching them.
- Always cordon BEFORE drain. The reverse races against the scheduler.
- For Kafka brokers: never drain two brokers from different replication sets in parallel; ISR goes red.

## Grounding sources

- *Kubernetes Guide* — Confluence space PENTA
- *Node Maintenance* — Confluence space PENTA
- *Cordon and Drain Steps* — Confluence space PENTA
- *Drain Edge Cases — taints, stale pods, PVCs* — Confluence space PENTA
