# Authoring Penta Helm Chart

# Authoring a penta/charts Helm chart

Scaffolds a new Helm 3 chart in the `penta/charts` monorepo with the required conventions so ArgoCD will sync it and CI conftest policies will pass.

## Instructions

When this skill is invoked, follow these steps:

1. **Gather inputs**: service name, container image (registry + repo), exposed port, secrets needed, prod replica count.
2. **Create directory** under `penta/charts/<service>/`:
   - `Chart.yaml` — name, version `0.1.0`, dependency on `penta-service` library chart.
   - `values.yaml` — safe defaults only.
   - `values.schema.json` — JSON schema (required; bump alongside any new values.yaml field).
   - `environments/{dev,stage,prod}/values.yaml` — per-env overrides.
3. **Use the library chart** — templates in `templates/` must `{{ include "penta-service.deployment" . }}` etc. Do not duplicate Deployment templates.
4. **Pin images by digest**:
   ```bash
   crane digest <repo>:<tag>
   ```
   Use `image.digest:` in values; never `image.tag:`.
5. **Required fields** (CI conftest blocks otherwise):
   - `securityContext.runAsNonRoot: true` at pod level.
   - CPU + memory requests set. Memory limit set.
   - Liveness + readiness probes. Startup probe if ready time >30s.
   - `PodDisruptionBudget` if replicas >1.
   - `topologySpreadConstraints` across zones for prod.
6. **Secrets** — never inline. Use External Secrets Operator with SSM prefix `secrets/<env>/<service>`. Reference via ExternalSecret CR.
7. **Validate locally**:
   ```bash
   helm lint .
   helm template . -f environments/prod/values.yaml > /tmp/out.yaml
   conftest test /tmp/out.yaml --policy ../../policies/
   ```
8. **Stage rollout** is automatic on merge. Prod rollout requires sync-window approval in ArgoCD.

## Best Practices

- Operate fully offline — flag missing dependencies rather than fetching them.
- Run conftest locally before opening the PR — saves a round trip.
- Bump `values.schema.json` in the same commit as any new values.yaml field.
- No Helm hooks (Tiller-era). Use ArgoCD sync waves instead.

## Grounding sources

- *Helm Guide* — Confluence space PENTA
- *Kubernetes Guide* — Confluence space PENTA
- *ArgoCD Guide* — Confluence space PENTA
