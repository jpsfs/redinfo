# redinfo Helm chart

This chart deploys the `redinfo` application (backend + frontend). It is intentionally simple for development and will be expanded for staging/production.

Basic commands (from repository root):

```bash
helm lint deploy/redinfo
helm template redinfo ./deploy/redinfo --values deploy/redinfo/values.dev.yaml
helm install --create-namespace --namespace dev redinfo-dev ./deploy/redinfo --values deploy/redinfo/values.dev.yaml --dry-run --debug
```

Dev notes:
- Development images use `redinfo/backend:dev` and `redinfo/frontend:dev` by default. Replace image tags in CI or in `values.dev.yaml`.
- Secrets are represented as placeholders in `values.*.yaml`. We recommend injecting secrets with an external secrets solution.

Extensibility:
- Add database manifests or subcharts when the platform requires it.
- Add RBAC, PVCs, or CRDs as needed for production.
