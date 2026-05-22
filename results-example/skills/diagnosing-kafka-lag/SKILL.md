---
name: diagnosing-kafka-lag
description: Use this skill when a user reports Kafka consumer lag, a lag alert has fired, or someone asks how to investigate slow Kafka consumers. Triggers include phrases like "consumer lag", "Kafka lag alert", "consumers falling behind", "offset not advancing", "lag is growing", "Kafka consumer slow", "consumer group stuck", or "why is my Kafka consumer not keeping up". Applies to all Team Penta services using Kafka, including Strimzi-managed clusters.
---

# Diagnosing Kafka Consumer Lag

Step-by-step diagnosis and resolution of Kafka consumer lag for Team Penta engineers, covering partition-level inspection, root cause identification, and targeted remediation.

## Instructions

When this skill is invoked, follow these steps:

### Phase 1 — Measure the Lag

1. Run the consumer group describe command to capture a snapshot of lag per partition:

   ```bash
   kafka-consumer-groups.sh \
     --bootstrap-server <broker>:9092 \
     --describe \
     --group <consumer-group-name>
   ```

   The output table shows `TOPIC`, `PARTITION`, `CURRENT-OFFSET`, `LOG-END-OFFSET`, and `LAG` for every partition. Record which partitions have non-zero lag and which `CONSUMER-ID` / `HOST` owns each partition.

2. If the broker address is unknown, look it up from the Strimzi `Kafka` CR or the team's `values.yaml`:

   ```bash
   kubectl get kafka -n <namespace> -o jsonpath='{.items[0].status.listeners[?(@.type=="plain")].bootstrapServers}'
   ```

### Phase 2 — Identify the Root Cause

Work through each candidate cause in order:

#### 2a. GC Pauses

3. Check consumer JVM GC logs for stop-the-world pauses longer than ~500 ms. Look for log lines containing `GC pause` or `Stop-the-world`:

   ```bash
   kubectl logs <consumer-pod> | grep -iE "GC pause|stop-the-world|safepoint"
   ```

4. Cross-check with JMX or Prometheus: a spike in `jvm_gc_pause_seconds` concurrent with lag growth confirms GC as the cause.

#### 2b. Slow Message Processing

5. Compare the consumer's message processing rate against the topic ingestion rate. In Grafana (or via JMX), compare:
   - `kafka.consumer:type=consumer-fetch-manager-metrics,records-consumed-rate` (consumer side)
   - `kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec` (broker side)

   If ingestion rate consistently exceeds consumption rate, the consumer logic is the bottleneck.

#### 2c. Rebalancing Storms

6. Look for the group cycling through `REBALANCING` state. A healthy group should stay in `STABLE`:

   ```bash
   kafka-consumer-groups.sh \
     --bootstrap-server <broker>:9092 \
     --describe \
     --group <consumer-group-name> \
     | grep -E "STATE|REBALANCING"
   ```

   Frequent rebalancing will appear as repeated `REBALANCING` lines or as consumer IDs changing between successive describe runs.

7. Check consumer logs for `Rebalance` or `LeaveGroup` events:

   ```bash
   kubectl logs <consumer-pod> | grep -iE "rebalance|LeaveGroup|revoked"
   ```

#### 2d. Under-Partitioned Topic

8. Count topic partitions and compare to consumer group size:

   ```bash
   kafka-topics.sh \
     --bootstrap-server <broker>:9092 \
     --describe \
     --topic <topic-name>
   ```

   If `PartitionCount` is less than the number of consumer instances, some instances are idle. Lag will concentrate on a small number of busy partitions.

### Phase 3 — Apply the Correct Remediation

Apply only the fix that matches the root cause identified in Phase 2.

#### Fix A — Slow Processing

9. Reduce `max.poll.records` in the consumer configuration to lower the amount of work per poll cycle (start with half the current value and measure impact). This prevents `max.poll.interval.ms` timeouts caused by long processing batches.

10. If a single consumer thread cannot keep up, increase parallelism: scale the consumer Deployment replica count up to the number of partitions. Never exceed partition count — extra replicas will be idle.

#### Fix B — GC Pauses

11. Tune the consumer JVM heap. In the pod's environment or JVM flags:

    ```
    -Xms1g -Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200
    ```

    For latency-sensitive consumers, switch to ZGC:

    ```
    -XX:+UseZGC
    ```

12. Redeploy the consumer pod and monitor GC pause duration metrics until pauses stay below 200 ms.

#### Fix C — Rebalancing Storms

13. Increase the session and heartbeat timeouts in the consumer's application config:

    ```properties
    session.timeout.ms=45000
    heartbeat.interval.ms=15000
    ```

14. Enable static membership to prevent unnecessary rebalances when pods restart:

    ```properties
    group.instance.id=<unique-stable-id-per-pod>
    ```

    In Kubernetes, set `group.instance.id` to `$(POD_NAME)` via the Downward API so each pod keeps a stable identity across restarts.

#### Fix D — Under-Partitioned Topic

15. Increase the partition count using a Strimzi `KafkaTopic` CR patch (never decrease partition count — it is irreversible):

    ```bash
    kubectl patch kafkatopic <topic-name> -n <namespace> \
      --type=merge \
      -p '{"spec":{"partitions":<new-count>}}'
    ```

    Wait for Strimzi to reconcile (`kubectl get kafkatopic <topic-name> -n <namespace> -w`).

16. Scale the consumer Deployment to match the new partition count:

    ```bash
    kubectl scale deployment <consumer-deployment> \
      -n <namespace> \
      --replicas=<new-partition-count>
    ```

### Phase 4 — Verify the Fix

17. Wait 2-3 minutes after deploying the fix, then re-run the describe command from Step 1 and confirm:
    - `LAG` values are decreasing across all affected partitions.
    - `CURRENT-OFFSET` is advancing on each re-run.

18. Set a watch to track progress in real time (Ctrl-C to stop):

    ```bash
    watch -n 10 "kafka-consumer-groups.sh \
      --bootstrap-server <broker>:9092 \
      --describe \
      --group <consumer-group-name>"
    ```

19. Confirm the JMX metric `kafka.consumer:type=consumer-fetch-manager-metrics,records-lag-max` has returned to zero (or to an acceptable steady-state value) before closing the incident.

## Examples

**Scenario: Alert fires — "consumer group orders-processor lag > 10000"**

```
# Step 1 — describe the group
kafka-consumer-groups.sh --bootstrap-server kafka.prod.svc:9092 \
  --describe --group orders-processor

# Output shows partition 3 has LAG=12450, owned by pod orders-processor-7d9f-xk2p

# Step 2 — check for rebalancing
kubectl logs orders-processor-7d9f-xk2p | grep -i rebalance
# Output: repeated "LeaveGroup" entries → rebalancing storm suspected

# Step 3 — apply Fix C: increase timeouts, add static membership
# Edit ConfigMap, redeploy, verify lag drains
```

**Scenario: Engineer asks "why is the analytics consumer falling behind after deploy?"**

```
# New deployment changed JVM flags — check GC pauses first
kubectl logs analytics-consumer-abc123 | grep "GC pause"
# Pauses of 2–4 s found → apply Fix B: switch to G1GC / ZGC
```

## Best Practices

- Set `auto.offset.reset=earliest` for batch-processing consumers to ensure no messages are skipped after a consumer group reset or new partition assignment.
- Tune `max.poll.records` downward before reaching for horizontal scaling; a lower value reduces per-poll processing time and prevents `max.poll.interval.ms` violations.
- Monitor lag continuously via the JMX metric `kafka.consumer:type=consumer-fetch-manager-metrics,records-lag-max`; alert at a threshold that gives enough lead time to investigate before the lag becomes operationally significant.
- Never decrease a topic's partition count — Kafka does not support this and any tooling that attempts it will either error or corrupt the topic.
- Always verify that the number of consumer replicas does not exceed the number of partitions; excess replicas consume resources and receive no messages.
- Use Strimzi `KafkaTopic` CRs as the single source of truth for topic configuration in Kubernetes environments; avoid making ad-hoc changes via `kafka-topics.sh` that will be overwritten by the operator.
- When enabling static membership (`group.instance.id`), ensure each instance has a globally unique and stable identifier — use the pod name via the Kubernetes Downward API rather than a hard-coded string.
- Document the root cause and remediation in the incident channel immediately after lag drains, referencing which partition(s) were affected and which fix was applied.
