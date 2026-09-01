# redinfo Helm chart

Deploys the `redinfo` application (backend + frontend + a bundled PostgreSQL subchart) to a
Kubernetes cluster. `dev` is Docker Compose only (see repo root `docker-compose.yml`) — this
chart is used for `staging` and `production`, each with its own `values.<env>.yaml`.

Basic commands (from repository root):

```bash
helm lint deploy/redinfo -f deploy/redinfo/values.staging.yaml
helm template redinfo deploy/redinfo --values deploy/redinfo/values.staging.yaml
helm upgrade --install redinfo deploy/redinfo -n staging --create-namespace \
  --values deploy/redinfo/values.staging.yaml --dry-run --debug
```

(On this cluster, `helm` is `microk8s helm3`.)

## How an environment gets deployed

The Azure DevOps pipeline (`.ado/deployment.yml`) triggers on pushes to `env/staging` and
`env/production`. Each stage packages this chart, copies it to the target host over SSH, and runs
`helm upgrade --install` with the matching `values.<env>.yaml` plus `--set-string` overrides for
anything secret (DB password, JWT secret, OAuth credentials, ...) pulled from an ADO variable
group named `redinfo-<env>`. See `.ado/templates/deploy-env.yml`.

## Secrets

Non-secret config lives in `values.<env>.yaml` under `env.backend` / `env.frontend`. Anything
secret-shaped is a key under `secrets:` (see `values.yaml` for the full list — it mirrors
`.env.example`), rendered into a Kubernetes Secret by `templates/secret-app.yaml`, and should only
ever be supplied via `--set-string` from the pipeline, never committed with a real value.

## Uploads

`ATTACHMENTS_DIR` (event report attachments, certification documents, profile photos) is backed by
a PersistentVolumeClaim (`templates/pvc-uploads.yaml`) with `helm.sh/resource-policy: keep`, so
`helm uninstall` never takes it down with the release.

## Seeding

When `seed.enabled: true`, a post-install/post-upgrade Job (`templates/job-seed.yaml`) runs
`prisma migrate deploy` then `prisma/seed.ts` (compiled — see `packages/backend/tsconfig.seed.json`)
to create the admin user and Portuguese geography reference data. Idempotent; safe to leave enabled
across upgrades.

## TLS

Ingress is HTTP-only until `cert-manager` is enabled on the cluster and a `ClusterIssuer` is
added — until then, Google/Microsoft OAuth login will not work on any environment deployed by
this chart (both providers reject a non-localhost `http://` redirect_uri), so use the seeded
local admin account instead.

Both `values.staging.yaml` and `values.production.yaml` already carry the `ingress.annotations`
(`cert-manager.io/cluster-issuer: letsencrypt-prod`) and `ingress.tls` needed once that issuer
exists — the one-time, cluster-scoped bootstrap itself (not part of this chart, since a
`ClusterIssuer` is shared infrastructure, not per-environment) lives at
`deploy/cluster-bootstrap/cluster-issuer.yaml`; see that file for the exact
`microk8s enable cert-manager` + `kubectl apply` steps. After it's applied and each
environment's certificate shows `READY` (`kubectl get certificate -n <env>`), flip that
environment's `FRONTEND_URL`/`GOOGLE_CALLBACK_URL`/`MICROSOFT_CALLBACK_URL` to `https://` (the
ADO variable group values for the latter two, plus the matching redirect URIs in the Google/
Microsoft OAuth app registrations) and redeploy.
