---
description: "Use this skill when a team Sentra engineer asks to add or modify a Prometheus alert — triggers include \"add an alert for X\", \"page when Y burns budget\", \"create a PrometheusRule\", \"alert on Z latency\". Walks through the burn-rate recording rule, PrometheusRule CR, runbook annotation, and the sentra/observability-config PR review path."
agent: build
---
# Adding a Prometheus alert (team Sentra)

Authors a new Prometheus alert end-to-end following Sentra's alerting standards: burn-rate recording rule → PrometheusRule CR → required runbook annotation → PR to `sentra/observability-config` with the right reviewers.

## Instructions

When this skill is invoked, follow these steps:

1. **Clarify the SLO target.** Ask the user (or extract from prompt): which service, which SLI (request-error ratio? latency p99? saturation?), the SLO objective (e.g. 99.9% over 30d), and the desired severity (`page` for customer-impact, `ticket` for slow-burn).
2. **Author a recording rule** for the burn rate. File: `rules/<service>.yaml`. Use the existing pattern `service:http_request_errors:ratio_rate5m`-style naming. Multiple windows for multi-window multi-burn-rate alerts (5m fast, 1h slow).
3. **Author the PrometheusRule CR.** Required fields:
   - `metadata.labels.team: sentra` (or owning team).
   - `spec.groups[].rules[].labels.severity`: `page` or `ticket`.
   - `spec.groups[].rules[].annotations.runbook_url`: REQUIRED. No alert ships without a runbook URL. Pull the relevant Confluence page URL.
   - `spec.groups[].rules[].annotations.summary` and `description` with template variables that name the service.
4. **Refuse anti-patterns:**
   - Do not use `up == 0` as a customer-facing alert (too noisy from rollouts).
   - Do not add an alert that does not point at a real runbook page.
5. **Verify in stage.** Open the PR. Verify the alert in stage Prometheus for at least 1 hour before merging. The team's review rule: 2 Sentra reviewers required.
6. **Open the PR** against `sentra/observability-config` with: title `[alerts] <service>: <one-line>`. Body must include: SLO target, severity rationale, link to a staging firing example or a synthetic-test screenshot.

## Examples

**Page on payments-service error-budget burn:**
```yaml
# rules/payments.yaml
- record: payments:http_request_errors:ratio_rate5m
  expr: sum(rate(http_requests_total{service="payments",code=~"5.."}[5m]))
      / sum(rate(http_requests_total{service="payments"}[5m]))
---
# PrometheusRule
- alert: PaymentsErrorBudgetBurnFast
  expr: payments:http_request_errors:ratio_rate5m > (14.4 * (1 - 0.999))
  for: 2m
  labels: { severity: page, team: sentra }
  annotations:
    summary: "payments burning error budget 14.4x"
    runbook_url: "https://kachlonistinvesting.atlassian.net/wiki/spaces/SENTRA/pages/2326529"
```

## Best Practices

- Multi-window multi-burn-rate (5m+1h) reduces flapping vs. a single window.
- Always include the recording rule even for a single alert — it makes the dashboard panel cheap.
- Cite the Confluence runbook page that defines the response, not the alert definition itself.
- The runbook_url annotation is enforced in CI; PRs without it fail lint.
- Use the `severity` label to route through Alertmanager (page → PagerDuty, ticket → Slack `#sentra-alerts`).

## Grounding sources

- *Prometheus — Metrics & Alerting Runbook* — https://kachlonistinvesting.atlassian.net/wiki/spaces/SENTRA/pages/2326529
- *Grafana — Dashboard Standards* (for the matching dashboard panel) — https://kachlonistinvesting.atlassian.net/wiki/spaces/SENTRA/pages/2261011
