#!/usr/bin/env bash
# check-quorum.sh — verify Redis Sentinel quorum across all 3 sentinel pods.
#
# Usage: ./check-quorum.sh <master-name>
# Returns 0 if quorum healthy (>=2 sentinels agree), 1 otherwise.
set -euo pipefail

MASTER="${1:?usage: $0 <master-name>}"
NS="${SENTINEL_NAMESPACE:-redis}"
LABEL="${SENTINEL_LABEL:-app.kubernetes.io/component=sentinel}"

# Discover sentinel pods.
mapfile -t PODS < <(kubectl get pod -n "$NS" -l "$LABEL" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')
if [[ ${#PODS[@]} -eq 0 ]]; then
  echo "ERROR: no sentinel pods found in ns=$NS with label=$LABEL" >&2
  exit 2
fi

reachable=0
for pod in "${PODS[@]}"; do
  echo "--- $pod"
  if out=$(kubectl exec -n "$NS" "$pod" -- redis-cli -p 26379 SENTINEL ckquorum "$MASTER" 2>&1); then
    echo "$out"
    reachable=$((reachable+1))
  else
    echo "  UNREACHABLE: $out"
  fi
done

echo
echo "summary: $reachable of ${#PODS[@]} sentinels reachable"
if [[ $reachable -lt 2 ]]; then
  echo "QUORUM UNHEALTHY — likely a network partition. Page network on-call before any Redis-side action." >&2
  exit 1
fi
echo "quorum healthy — safe to let Sentinel decide failover"
