# Split-brain recovery procedure

Two Redis instances both reporting `role:master`. This is the rare,
catastrophic case. The team has had data loss when this was handled by feel
rather than by following these steps.

## 0. Preconditions

- `SENTINEL ckquorum` returns success on at least 2 sentinels.
- `INFO replication` on TWO different pods both shows `role:master`.

If either precondition is false, this is NOT split-brain — return to the
failover-loop or +odown path in `SKILL.md`.

## 1. PAUSE WRITES at the application layer

Coordinate with the app on-call. All writers must drain in-flight requests
and stop new ones. Until this is confirmed, do not proceed — every write
after this point becomes divergence.

## 2. Identify the authoritative master

On both master candidates:
```bash
redis-cli -p 6379 INFO replication | grep master_repl_offset
```

Choose the candidate with the HIGHER `master_repl_offset`. Ties: pick the
older candidate (longer uptime). Document the choice in the incident
channel.

## 3. Reconcile roles

On the chosen master (the "winner"):
```redis
SLAVEOF NO ONE
```

On the other (the "loser"):
```redis
SLAVEOF <winner-ip> 6379
```

Watch the loser's `master_link_status` go to `up` in `INFO replication`.

## 4. Reset Sentinel state

On every sentinel pod:
```redis
SENTINEL RESET *
```

Wait 30s, then re-check `SENTINEL ckquorum <master-name>` on each.

## 5. Reconcile divergent keys

Keys written to the loser between steps 0 and 3 are now gone. The app
on-call must run the application's idempotent reconciliation path
(re-deriving cache entries from the source-of-truth datastore). Until this
completes, leave writes paused.

## 6. Resume writes

App on-call un-pauses writers. Monitor error rate for 10 min.

## 7. Postmortem

Always file one. Use `./postmortem-template.md`. The action items typically
include hardening the L3 network between AZs (the root cause is usually a
network partition).
