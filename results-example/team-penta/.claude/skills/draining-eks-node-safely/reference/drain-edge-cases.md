# Drain edge cases

## Stuck terminating pods

Usually a stuck finalizer. Diagnose:
```bash
kubectl get pod <name> -n <ns> -o json | jq '.metadata.finalizers, .status.phase'
```

If a finalizer is present and the owning controller has confirmed cleanup
(check the controller's logs), patch it off:
```bash
kubectl patch pod <name> -n <ns> -p '{"metadata":{"finalizers":null}}'
```

Never patch off a finalizer without first confirming the controller's work
is complete. This is how data deletion gets skipped.

## PVC-bound stateful pods refusing to evict

Sentinel and Kafka pods are bound to specific AZ PVs. Drain will block
because the autoscaler cannot place the replacement pod outside its PV's
AZ.

Fix: pre-warm the new node in the same AZ before draining.

```bash
# Force a node group expansion in the target AZ:
kubectl scale --replicas=N+1 deploy/cluster-autoscaler-canary -n kube-system
```

## Taint conflicts

- `NoExecute` taints — drain respects these; pods move.
- `NoSchedule` taints — apply with cordon for a soft drain (no eviction,
  but no new pods scheduled).
- `PreferNoSchedule` taints — ignored by drain.
