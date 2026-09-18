# CI/CD — `.ado/deployment.yml`

Pipeline id 4 (`jpsfs.redinfo`), org `jpsfs`, project `redinfo`. Triggers on pushes to `dev`,
`env/staging`, and `env/production` — those three branches double as environment names (`dev` is
Docker Compose only, never deployed by this pipeline; see `deploy/redinfo/README.md`).

## Image tagging

Every image is tagged twice:

- `sha-<shortSha>` — the first 8 characters of the commit's `Build.SourceVersion`. This is the
  tag every deploy actually uses (`imageTag` passed to `templates/deploy-env.yml`).
- `<branchName>` — a moving tag (`dev` / `staging` / `production`) for convenience only; nothing
  in this pipeline deploys by that tag.

`Build.BuildId` never appears in an image tag. Tagging by commit is what makes **promotion by
fast-forward** meaningful: if `env/staging`'s tip commit is fast-forwarded onto `env/production`
(rather than merged, rebased, or re-committed), the SHA is unchanged, so `sha-<shortSha>` is
unchanged, so `DeployProduction` reuses the *exact same image* that was already built and
smoke-tested on staging — no rebuild, no "staging passed but production got a different binary"
gap.

## Stage graph

```
Prepare ──┬─▶ Build ──┬─▶ DeployStaging ──▶ MarkStagingVerified
          │           │
          │           ├─▶ PromotionGate ──┬─▶ DeployProduction        (vm-redcross)
          │           │        ▲          └─▶ DeployProductionContabo (Contabo host)
          │           └────────┘ (both read Build's result)
          │
          ├─▶ TerraformDrift      (env/production only; warns, never acts)
          └─▶ GenerateManuals
```

- **Prepare** (hosted) always runs. It computes, once, everything every other stage needs to
  decide whether to run: `shortSha`, `imagesExist` (do all four `sha-<shortSha>` images already
  exist in the registry?), `stagingVerified` (does a `staging-ok-<shortSha>` marker exist?), and
  `isDocsCommit` (does the tip commit's subject match Conventional Commits' `docs` type?).
- **Build** (hosted) is skipped on `dev` outright, and skipped on `env/staging`/`env/production`
  when `imagesExist` is already `true` — i.e. re-pushing an already-built commit (typically:
  fast-forwarding `env/staging` onto `env/production`) doesn't rebuild anything. The
  `forceRebuild` parameter overrides this.
- **DeployStaging** / **DeployProduction** run on the self-hosted `vm-redcross` agent (see
  `templates/deploy-env.yml`) — the same machine as the k8s cluster, no SSH hop. The first run
  that ever references a given pool from this pipeline definition gets ADO's own one-time
  "this pipeline needs permission to use resource pool vm-redcross" prompt — separate from, and
  not to be confused with, an Environment approval check (see "Who can deploy to production"
  below). Someone with permission clicks through it once per pool per pipeline; it does not
  recur after that.
- **MarkStagingVerified** stamps the `staging-ok-<shortSha>` marker described below — the only
  thing standing between "staging deploy succeeded" and "this commit is allowed to production".
- **PromotionGate** enforces that marker on the way to production, `forceProduction` bypasses it.
- **DeployProductionContabo** is the second production host, running in parallel with
  `DeployProduction` during the vm-redcross → Contabo migration: same commit, same images, same
  `redinfo-production` secrets, same gate — a different machine, on its own
  `contabo-production` pool. It is off unless `CONTABO_DEPLOY_ENABLED` is `'true'` in the
  `redinfo-contabo` variable group, so a host joins or leaves the production rotation by editing
  one variable rather than by a commit. Neither production stage depends on the other; either can
  fail alone. The host itself is provisioned by `.ado/infrastructure.yml`, a separate manual-run
  pipeline — see `infra/README.md` for why provisioning is not a stage in front of this one.
- **TerraformDrift** runs `terraform plan` against the Contabo host on every production
  deploy and **never applies anything** — apply and destroy live in `.ado/infrastructure.yml`
  behind a human picking the verb and ticking a confirmation box. It exists for one reason:
  four attributes of `contabo_instance` reinstall the machine when they change, and one of them
  is `user_data`, so a merged edit to `cloud-init.yaml.tftpl` silently leaves production one
  apply away from being rebuilt. This stage says so at the moment that change reaches
  production, and names the attribute. Nothing depends on it, so like `GenerateManuals` it can
  never delay or block a deploy. It is not gated on "did `infra/terraform/**` change": `Prepare`
  checks out shallow so there is no reliable parent to diff against, and a file-diff gate is
  blind to drift introduced in the Contabo panel. `terraform plan`'s own exit code is the more
  accurate gate — no changes means one line of output. The plan runs with `-lock=false` so it
  can never block a real apply.
- **GenerateManuals** depends on `Prepare` alone and is routed by commit message or the manual
  `forceGenerateManuals` override — see below.

### The skipped-`Build` condition

`Build` legitimately **skips** (not fails) when the commit's images already exist. Every stage
downstream of `Build` — `DeployStaging`, `PromotionGate`, `DeployProduction` — has to treat
"Build skipped" the same as "Build succeeded", and only actually block on "Build failed or
canceled". `succeeded()` does not do this: a skipped dependency reads as "not succeeded", which
would permanently block every promotion after the very first real build. Each of those stages
therefore uses an explicit condition instead of the default:

```yaml
condition: |
  and(
    eq(variables['Build.SourceBranch'], 'refs/heads/env/staging'),   # (or env/production)
    in(dependencies.Prepare.result, 'Succeeded', 'SucceededWithIssues'),
    not(in(dependencies.Build.result, 'Failed', 'Canceled'))
  )
```

`dependencies.Build.result` is one of `Succeeded | SucceededWithIssues | Skipped | Failed |
Canceled` — verified against
[Microsoft's pipeline-conditions / expressions docs](https://learn.microsoft.com/azure/devops/pipelines/process/expressions#dependencies).
`not(in(..., 'Failed', 'Canceled'))` passes for `Succeeded`, `SucceededWithIssues`, *and*
`Skipped`, which is exactly "there is a good image to deploy, one way or another".

## The `staging-ok-<sha>` marker

`jpsfs/redinfo-backend:staging-ok-<shortSha>` is a tag with no real content — `imagetools create`
just points it at the already-pushed `sha-<shortSha>` manifest (a registry-side copy, no pull, no
build). Its only purpose is to exist or not exist. If it exists, commit `<shortSha>` was deployed
to staging by `DeployStaging` **and** passed the post-deploy smoke check inside
`templates/deploy-env.yml` (real HTTP 200s through the frontend's nginx → backend proxy, not just
Kubernetes readiness probes). `PromotionGate` checks for exactly this tag before letting the same
commit anywhere near `DeployProduction`.

## Force parameters

All of them are pipeline parameters (`type: boolean, default: false`) settable only from a
**manual** run ("Run pipeline" in the UI, `az pipelines run --parameters`, or the REST API's
`templateParameters`) — a push can never set them, there is no `trigger:`-side mechanism for
pipeline parameters.

- **`forceRebuild`** — rebuild and re-push all four images even though `sha-<shortSha>` already
  exists. Use when an image was somehow pushed corrupt/incomplete, or the registry cache needs
  busting for a `buildcache` tag issue.
- **`forceProduction`** — deploy to production even though `staging-ok-<shortSha>` doesn't exist
  for this commit. `PromotionGate` prints a loud warning naming the commit and proceeds anyway.
  Use only for a deliberate, understood exception (e.g. a production-only hotfix that was never
  meant to go through staging) — the normal path is always: land the fix on `env/staging`, let it
  deploy and smoke-test, then fast-forward onto `env/production`.
- **`forceGenerateManuals`** — run `GenerateManuals` even though the tip commit isn't a `docs`
  commit. This is the intended way to regenerate the manuals on demand — it replaces triggering
  the stage with an empty `docs:` commit.
- **`deployToContabo`** — run `DeployProductionContabo` on this one run regardless of
  `CONTABO_DEPLOY_ENABLED`. For trying the new host out before committing it to the rotation.
- **`contaboBackgroundJobs`** — on the Contabo host only, enable the legacy-migration cron and
  the INEM worker. **Off by default, deliberately**: while vm-redcross is live, a second
  instance with the same credentials means two machines pulling from one legacy MySQL and two
  headless browsers fighting over one INEM session. Neither fails at deploy time. Turn it on at
  cutover — see `infra/README.md`.

## Manuals

`GenerateManuals` triggers when the **tip commit** on `dev` / `env/staging` / `env/production` has
a subject matching Conventional Commits' `docs` type — `docs: ...` or `docs(<scope>): ...`,
optionally with a `!` (e.g. `docs(manual-operador)!: ...`) — or when a manual run sets
`forceGenerateManuals`. It regenerates every manual under `docs/*/` (see
`.ado/templates/generate-manuals.yml`) against a real, dev-seeded stack it stands up itself, and
publishes the resulting PDFs as the `manuals` pipeline artifact. It depends only on `Prepare`, by
design — it never gates and can never block a deploy; a failure here shows up on that one run and
nothing else.

A commit that only touches docs but shouldn't trigger a manual regeneration (typos, wording,
internal notes) should use a different Conventional Commits type, e.g. `chore(docs): ...`.

## Who can deploy to production

Deliberately no ADO approval check on the `redinfo-production` Environment — the human control
is push access to `env/production` itself (GitHub branch protection restricting who can push
there), not a click in ADO. The only in-pipeline gate is `PromotionGate`: production refuses any
commit without a `staging-ok-<sha>` marker, short of `forceProduction`. Once a push to
`env/production` lands, the pipeline runs straight through to a deploy with no pause for
approval — that's the intended behavior, not a bug.

`DeployProductionContabo` uses a *second* Environment, `redinfo-production-contabo`, and the
same reasoning applies to it. Two Environments rather than one because the two stages deploy the
same release to two different machines, and a single Environment's deployment history would blur
them together — which is exactly the history you want to read during a migration.
