# Diagnosing Kafka Lag

# Diagnosing Kafka consumer lag (team Penta)

Walks the canonical Kafka consumer-lag investigation on Penta's Strimzi-managed clusters.

## Instructions

When this skill is invoked, follow these steps:

1. **Identify the consumer group + topic** from the alert. If unknown, ask once.
2. **Snapshot lag per partition**:
   ```bash
   kubectl exec -n kafka <broker-0> -- bin/kafka-consumer-groups.sh \
     --bootstrap-server localhost:9092 \
     --describe --group <group>
   ```
   Note: total LAG, distribution across partitions (skew?), LAG growth rate.
3. **Classify the pattern**:
   - **Uniform high lag** → consumer side. Throughput problem, not Kafka. Page the consuming service's owner.
   - **One partition lagging** → partition leadership issue OR consumer-side key-skew. Check ISR for that partition.
   - **Climbing lag during stable traffic** → broker disk pressure or replication lag. Check `kafka-replica-verification.sh`.
4. **For broker disk pressure** — check `df -h` on each broker pod. If a topic is the culprit, lower `retention.bytes` via the KafkaTopic CR (NEVER via `kafka-configs.sh`).
5. **For consumer-side skew** — the producer is using a poor key. Hand off to the producing service's team; recommend a key strategy review.
6. **Refuse**:
   - No `kafka-consumer-groups.sh --reset-offsets` without explicit data-loss sign-off from the consuming team.
   - No imperative `kafka-topics.sh --alter` to "fix" partition count in prod.

## Examples

```bash
# Describe a group across all partitions:
kubectl exec -n kafka kafka-0 -- bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group payments-events

# Edit retention on a topic via CR (the only sanctioned path):
kubectl edit kt/payments-events -n kafka
```

## Best Practices

- Operate fully offline — flag missing dependencies rather than fetching them.
- LAG ≠ broker problem 80% of the time. Default to consumer-side investigation first.
- All topic changes go through the CR. The KafkaTopic / Strimzi pages explain why.

## Grounding sources

- *Kafka Guide* — Confluence space PENTA
- *Strimzi Operator for Kafka* — Confluence space PENTA
- *Kafka Topic CRDs* — Confluence space PENTA
