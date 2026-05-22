---
name: debugging-redis-sentinel-failover
description: Use this skill when a user reports Redis READONLY errors, Sentinel failover not triggering, clients stuck reconnecting after a master failure, connection refused or timeout errors against a Redis Sentinel cluster, or quorum failures. Covers diagnosing READONLY writes-to-replica errors, verifying Sentinel quorum and topology, executing manual failover, fixing Sentinel-unaware client configurations, and hardening Sentinel settings to prevent recurrence. Trigger keywords: redis READONLY, sentinel failover, redis master down, sentinel quorum, redis replica error, failover not completing, clients not reconnecting, redis connection refused.
---

# Debugging Redis Sentinel Failover

Step-by-step diagnosis and remediation of Redis Sentinel failover issues, based on Team Penta's Redis operational runbook.

## Instructions

When this skill is invoked, follow these steps:

### Step 1 — Identify the Symptom

Classify the reported symptom before issuing any commands:

- **READONLY errors** (`READONLY You can't write against a read only replica`): clients are writing to a node that was demoted from master to replica. The application has not yet discovered the new master.
- **Connection refused / timeouts**: the master process is down and Sentinel has either not yet completed failover or no quorum was reached.
- **Failover not triggering / stuck**: Sentinel has detected the master is down but has not promoted a replica. Common causes are a quorum shortfall or `down-after-milliseconds` set too high relative to actual outage duration.

Ask the user which symptom they are seeing if it is not stated — the remediation path differs.

### Step 2 — Check Sentinel State

Run the following commands against any Sentinel node (default port 26379). Replace `mymaster` with the actual master name if it differs.

**List all known masters and their current state:**
```
redis-cli -p 26379 sentinel masters
```
Look at the `flags` field. A healthy master shows `master`. Flags such as `s_down`, `o_down`, or `disconnected` indicate a problem.

**List replicas known to Sentinel:**
```
redis-cli -p 26379 sentinel slaves mymaster
```
Verify replica count matches expectations. Replicas should show `flags: slave` (not `disconnected`).

**Confirm all three Sentinels are visible to each other:**
```
redis-cli -p 26379 sentinel sentinels mymaster
```
The output must list **2 peer Sentinels** (the one you queried is implicit, giving 3 total). If fewer appear, a Sentinel process is down or network-partitioned — fix this before proceeding.

### Step 3 — Verify Quorum

```
redis-cli -p 26379 sentinel ckquorum mymaster
```

The response must be:
```
OK 3 usable Sentinels. Quorum and failover authorization can be reached
```

If it returns an error or reports fewer than 3 usable Sentinels, restore the missing Sentinel instances before attempting any failover. Quorum = 2 (majority of 3); failover cannot proceed without it.

### Step 4 — Trigger Manual Failover (if Sentinel Has Not Done So Automatically)

Only run this after Step 3 confirms quorum is healthy:

```
redis-cli -p 26379 sentinel failover mymaster
```

Expected response: `OK`. Sentinel will elect a replica, promote it, and reconfigure the old master as a replica. The operation typically completes within seconds.

If the command returns an error such as `NOGOODSLAVE` or `IDONTKNOW`, check replica connectivity from Step 2 before retrying.

### Step 5 — Verify the New Master

After failover completes (automatic or manual), confirm the promoted master's address:

```
redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
```

This returns `<ip> <port>`. Verify the IP has changed from the previously failed node. Cross-check with your application's configured Sentinel endpoints.

### Step 6 — Fix Clients Stuck on READONLY

If the application is still receiving READONLY errors after a successful failover:

1. **Confirm the client library is Sentinel-aware.** The client must query Sentinel for the current master address on every new connection, not cache a static IP. Accepted libraries include `redis-py` (with `Sentinel` class), `ioredis` (with `sentinels` option), `Jedis` (`JedisSentinelPool`), and `StackExchange.Redis` (with `ServiceName`). If the client is connecting directly to a hardcoded master IP, this is the root cause — update the connection string to point at Sentinel.

2. **Implement a READONLY retry loop.** Even with a Sentinel-aware client, a brief window exists between failover completion and client reconnection. The application must catch `READONLY` exceptions, close the stale connection, re-resolve the master address via Sentinel, and re-issue the failed command. Pseudocode pattern:
   ```
   for attempt in range(MAX_RETRIES):
       try:
           conn = sentinel.master_for('mymaster')
           conn.set(key, value)
           break
       except ReadOnlyError:
           sleep(backoff(attempt))
   ```

3. **Restart or force-reconnect application pods** if the client library does not handle this automatically and production traffic is still hitting the old replica.

### Step 7 — Prevent Future Issues

After the immediate incident is resolved, apply these hardening steps:

1. **Tune `down-after-milliseconds`** to match your network's realistic latency. The default is 5000 ms (5 s). If your network latency is under 10 ms, a value of 5000 ms is appropriate. Do not set it below 1000 ms in production to avoid false positives.

2. **Ensure exactly 3 Sentinel instances are running at all times.** Add Sentinel health checks to your monitoring. Alert when `sentinel_known_sentinels` drops below 2.

3. **Test failover regularly in staging:**
   ```
   redis-cli -p 26379 sentinel failover mymaster
   ```
   Verify that application traffic recovers automatically within your SLA window.

4. **Never hardcode the master IP** in application configuration. Always use the Sentinel service address.

## Examples

**User:** "We're seeing `READONLY You can't write against a read only replica` errors in production."

Invoke Step 1 (classify as READONLY), then Steps 2–3 (check topology and quorum), then Step 5 (confirm current master), then Step 6 (fix client reconnection).

---

**User:** "Redis master went down 10 minutes ago, Sentinel hasn't promoted anything."

Invoke Step 1 (classify as failover not triggering), then Steps 2–3 to check Sentinel peer visibility and quorum, then Step 4 to trigger manual failover if quorum is healthy.

---

**User:** "`sentinel ckquorum mymaster` returns only 2 usable Sentinels."

Stop. Do not trigger failover. Identify which Sentinel is missing using `sentinel sentinels mymaster`, restore it, re-run `ckquorum`, then proceed to Step 4.

## Best Practices

- Run a minimum of 3 Sentinel instances; set quorum to 2 (majority). Never run 2 Sentinels — quorum can never be reached during a partition.
- Never point application clients directly at the master IP. Always use Sentinel for master discovery so that failover is transparent to the application.
- Monitor `sentinel_known_slaves` and `sentinel_known_sentinels` as continuous metrics; alert on any decrease below expected values.
- Keep `down-after-milliseconds` consistent across all Sentinel instances for the same master. Inconsistent values cause split-brain failover behavior.
- Ensure the `bind` and `protected-mode` settings in `sentinel.conf` allow Sentinel peers to reach each other; a Sentinel that cannot communicate with peers is invisible to quorum.
- After any failover — planned or unplanned — verify that the old master has rejoined as a replica (`redis-cli -p 6379 info replication` should show `role:slave`).
- Document the master name (`mymaster` or custom) and Sentinel port in your team runbook; mismatches in monitoring commands are a common source of confusion during incidents.
