# Building Grafana Dashboard

# Building a team Sentra Grafana dashboard

Authors a dashboard as code in the `sentra/grafana-dashboards` repo so ArgoCD provisions it into the `grafana` namespace.

## Instructions

When this skill is invoked, follow these steps:

1. **Pick the folder.** One of:
   - `Sentra / SLO` — one dashboard per service, RED + latency histograms.
   - `Sentra / Capacity` — node, namespace, quota panels.
   - `Sentra / Incidents` — pinned drill-downs we build/keep after postmortems.
2. **Define template variables in this exact order:** `$datasource`, `$cluster`, `$namespace`, `$service`. The datasource MUST be a variable — never hard-code a UID. The team has been bitten by promoting dashboards with a hard-coded UID.
3. **Panel-level rules (every panel):**
   - Description set (CI lint blocks merge otherwise).
   - Time range respects the dashboard time picker (don't override per panel).
   - Query references the datasource variable: `${datasource}`.
   - Enable exemplars wherever the underlying metric is a histogram.
4. **Time picker defaults:** range = 1h, refresh = 30s. Never auto-refresh faster than the scrape interval.
5. **Use `topk()` aggressively.** If a panel queries unbounded series, add `topk(10, ...)` or pre-aggregate via a recording rule.
6. **Workflow:**
   1. Edit JSON in `sentra/grafana-dashboards/<folder>/<dashboard>.json`.
   2. Open PR — CI runs `dashboard-linter` and renders a screenshot diff in the PR comment.
   3. Merge — ArgoCD syncs into the `grafana` namespace.
7. **Anti-patterns to refuse:**
   - Hard-coded datasource UID.
   - Panel without a description.
   - Auto-refresh faster than scrape interval.
   - Lens panels for >1d ranges (Lens pulls the full result set into the browser).

## Examples

**Template variable definition (datasource):**
```json
{
  "name": "datasource",
  "type": "datasource",
  "query": "prometheus",
  "current": { "selected": false }
}
```

**Panel query stub:**
```promql
sum by (service) (rate(http_requests_total{cluster="$cluster",namespace="$namespace",service=~"$service"}[5m]))
```

## Best Practices

- For SLO dashboards, mirror the structure of the existing `Sentra / SLO / payments` dashboard — it's the team's canonical template.
- For incident dashboards, link to the postmortem in the dashboard description so context is not lost.
- Slow-rendering panels are almost always cardinality — add `topk()` before adding panel-level caching.
- For panels backed by recording rules: name the recording rule with the service prefix (`payments:http_request_errors:ratio_rate5m`).

## Grounding sources

- *Grafana — Dashboard Standards* — https://kachlonistinvesting.atlassian.net/wiki/spaces/SENTRA/pages/2261011
- *Prometheus — Metrics & Alerting Runbook* — https://kachlonistinvesting.atlassian.net/wiki/spaces/SENTRA/pages/2326529
