# Authoring Sentra Helm Chart

# Authoring a sentra/charts Helm chart

Scaffolds a new Helm 3 chart in the `sentra/charts` monorepo with the required conventions so ArgoCD will sync it and CI conftest policies will pass.

## Instructions

When this skill is invoked, follow these steps:

1. **Gather inputs:** service name, container image (registry + repo, you'll pin digest later), exposed port, dependencies (secrets needed, downstream services), prod replica count.
2. **Create the chart directory** under `sentra/charts/<service>/`. Required files:
   - `Chart.yaml` — name, version (start at `0.1.0`), `dependencies` referencing the `sentra-service` library chart.
   - `values.yaml` — safe defaults ONLY. No environment-specific values here.
   - `values.schema.json` — JSON Schema. Required: schema bumps must accompany every new values.yaml field.
   - `environments/dev/values.yaml`, `environments/stage/values.yaml`, `environments/prod/values.yaml` — per-env overrides.
3. **Use the library chart.** Templates in `templates/` should be thin — they should `{{ include "sentra-service.deployment" . }}` etc. Never duplicate Deployment templates.
4. **Pin images by digest.** Resolve `<repo>:<tag>` to a digest before merging: `crane digest <repo>:<tag>`. Set `image.digest:` in values, never `image.tag:`.
5. **Enforce required fields:**
   - `securityContext.runAsNonRoot: true` (top-level pod spec).
   - Resource requests set (CPU + mem). Memory limit set. CPU limit optional.
   - Liveness + readiness probes. Startup probe if ready time >30s.
   - `PodDisruptionBudget` if replicas >1.
   - `topologySpreadConstraints` across zones for prod.
6. **Secrets:** never inline. Use External Secrets Operator with `secrets/<env>/<service>` SSM prefix. Reference via ExternalSecret CR in templates.
7. **Validate locally:**
   ```bash
   helm lint .
   helm template . -f environments/prod/values.yaml > /tmp/out.yaml
   conftest test /tmp/out.yaml --policy ../../policies/
   ```
8. **PR opens stage rollout automatically.** Prod rollout requires the sync-window approval in ArgoCD.

## Examples

```yaml
# Chart.yaml
apiVersion: v2
name: orders
version: 0.1.0
dependencies:
  - name: sentra-service
    version: "~3.2"
    repository: "file://../../libs/sentra-service"
```

```yaml
# values.yaml (safe defaults)
image:
  repository: 123456789012.dkr.ecr.eu-west-1.amazonaws.com/orders
  digest: sha256:REPLACE_BEFORE_MERGE
replicaCount: 2
resources:
  requests: { cpu: 100m, memory: 256Mi }
  limits: { memory: 512Mi }
securityContext:
  runAsNonRoot: true
```

## Best Practices

- The CI conftest gates reject `:latest`, privileged pods, and missing requests. Run conftest locally before opening the PR — saves a round trip.
- Bump `values.schema.json` in the same commit as any new values.yaml field.
- Do not use Helm hooks (Tiller-era). Use ArgoCD sync waves instead.
- If a release ever gets stuck `pending-upgrade`: `helm rollback <release> <rev>`, then re-sync ArgoCD. Never `helm history --max 0`.
- For state, prefer external managed services. StatefulSets need explicit on-call sign-off per the K8s standards page.

## Grounding sources

- *Helm — Chart Authoring Guidelines* — https://kachlonistinvesting.atlassian.net/wiki/spaces/SENTRA/pages/2228244
- *Kubernetes — Cluster Standards & Triage* — https://kachlonistinvesting.atlassian.net/wiki/spaces/SENTRA/pages/2261029
