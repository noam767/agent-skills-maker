---
description: "Use this skill when the Strimzi Topic Operator is failing — topics stuck Pending, reconciliation flapping, operator pod OOMKilled, or KafkaTopic CR drift versus broker state. Walks symptom-to-fix for the documented failure modes without destructive shortcuts."
agent: build
---
# Recovering the Strimzi Topic Operator (team Penta)

Walks the canonical recovery for Topic Operator failures on Penta's Kafka clusters.

## Instructions

When this skill is invoked, follow these steps:

1. **Pin the symptom**:
   - Topic stuck `Pending` → step 2.
   - Reconciliation flapping → step 3.
   - Operator OOMKilled in a loop → step 4.
   - Spec drift (broker config != CR) → step 5.
2. **For `Pending` topics**: 90% likely the operator can't reach Zookeeper. Verify ZK quorum FIRST (`zkServer.sh status` on each ZK pod). Only after ZK is healthy, check the CR for invalid retention values (`InvalidConfig` in operator logs).
3. **For flapping reconciliation**: someone is altering broker config in parallel. Audit `kafka-configs.sh` usage via Kafka audit logs. Reconcile by editing the CR; never patch broker config directly.
4. **For operator OOMKilled**: raise the operator memory request. Do not shard the operator. Do not lower the reconciliation interval to "spread the load" — that makes it worse.
5. **For CR-broker drift**: re-apply the CR with the desired spec. The operator reconciles non-destructively (no topic delete + recreate). Document why drift occurred in the incident notes.
6. **Hard refusals**:
   - Never `kubectl delete kt/<name>` to "force a recreate" — the topic data goes with it.
   - Never edit broker config via `kafka-configs.sh` in prod.
   - Never bypass `min.insync.replicas` via CR — it must stay 2 in prod.

## Examples

```bash
# Check ZK quorum first when topic is Pending:
for pod in $(kubectl get pod -n kafka -l app=zookeeper -o name); do
  echo "--- $pod"
  kubectl exec -n kafka $pod -- bin/zkServer.sh status
done

# Reconcile a drifted KafkaTopic to spec:
kubectl edit kt/<topic-name> -n kafka
```

## Best Practices

- Operate fully offline — flag missing dependencies rather than fetching them.
- ZK quorum is the precondition for everything Strimzi-related. Verify it before debugging the operator.
- File the audit-log line that shows who ran the manual `kafka-configs.sh`; this is how the team prevents the next incident.

## Grounding sources

- *Strimzi Operator for Kafka* — Confluence space PENTA
- *Kafka Topic CRDs* — Confluence space PENTA
- *TopicOperator Failure Modes* — Confluence space PENTA
- *Zookeeper Guide* — Confluence space PENTA
