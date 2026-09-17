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

The Azure DevOps pipeline (`.ado/deployment.yml`) triggers on pushes to `dev`, `env/staging`, and
`env/production` (`dev` never deploys — see above). `DeployStaging`/`DeployProduction` run
directly on the self-hosted `vm-redcross` agent — the same machine as the k8s cluster, so there is
no SSH hop, no chart packaging/copy step: the chart is read straight out of the agent's own
checkout (`$(Build.SourcesDirectory)/deploy/redinfo`). Each stage runs `helm upgrade --install`
with the matching `values.<env>.yaml` plus `--set-string` image overrides (repository/tag/
pullPolicy for all four images, tag = the commit's short SHA — see `.ado/README.md` for the
tagging scheme) and a rendered secrets values file, pulling secret values from an ADO variable
group named `redinfo-<env>`. A post-deploy smoke check (real HTTP requests through the frontend's
nginx → backend proxy) gates whether the deploy is considered to have succeeded. See
`.ado/templates/deploy-env.yml`.

## Secrets

Non-secret config lives in `values.<env>.yaml` under `env.backend` / `env.frontend`. Anything
secret-shaped is a key under `secrets:` (see `values.yaml` for the full list — it mirrors
`.env.example`), rendered into a Kubernetes Secret by `templates/secret-app.yaml`. The pipeline
renders these into a `secrets.yaml` values file on the agent (`chmod 600`, deleted after the
`helm upgrade` step) and passes it with `-f`, rather than `--set-string` on the command line —
values never appear as command-line arguments, so they never land in `ps aux` or shell history on
the deploy host. Never commit a real value into `values.<env>.yaml` itself.

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

Ingress is HTTP-only at the origin for both staging and production — `cert-manager` is not enabled
on this cluster (an earlier attempt at that, `cluster-issuer.yaml` + `ingress.tls`, was reverted).
Both environments' real hosts sit behind Cloudflare, which proxies and terminates TLS for the
browser; a plain-http origin behind that is the working setup. `env.backend.FRONTEND_URL` must
still be `https://...` in both `values.staging.yaml` and `values.production.yaml` regardless — it's
used verbatim to build the post-OAuth redirect Location, so an `http` value there breaks
Google/Microsoft login even though the origin itself never speaks TLS.
