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
          │           ├─▶ PromotionGate ──▶ DeployProduction
          │           │        ▲
          │           └────────┘ (both read Build's result)
          │
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
  `templates/deploy-env.yml`) — the same machine as the k8s cluster, no SSH hop.
- **MarkStagingVerified** stamps the `staging-ok-<shortSha>` marker described below — the only
  thing standing between "staging deploy succeeded" and "this commit is allowed to production".
- **PromotionGate** enforces that marker on the way to production, `forceProduction` bypasses it.
- **GenerateManuals** depends on `Prepare` alone and is routed purely by commit message — see
  below.

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

Both are pipeline parameters (`type: boolean, default: false`) settable only from a **manual**
run ("Run pipeline" in the UI, `az pipelines run --parameters`, or the REST API's
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

## Manuals

`GenerateManuals` triggers when the **tip commit** on `dev` / `env/staging` / `env/production` has
a subject matching Conventional Commits' `docs` type — `docs: ...` or `docs(<scope>): ...`,
optionally with a `!` (e.g. `docs(manual-operador)!: ...`). It regenerates every manual under
`docs/*/` (see `.ado/templates/generate-manuals.yml`) against a real, dev-seeded stack it stands
up itself, and publishes the resulting PDFs as the `manuals` pipeline artifact. It depends only on
`Prepare`, by design — it never gates and can never block a deploy; a failure here shows up on
that one run and nothing else.

A commit that only touches docs but shouldn't trigger a manual regeneration (typos, wording,
internal notes) should use a different Conventional Commits type, e.g. `chore(docs): ...`.

## Approving a production deploy

Once the `redinfo-production` Environment has a manual approval check attached (see
`DeployProduction`'s comment in `deployment.yml` — not yet created as of this redesign),
approving from the CLI is `scripts/ado-approve-production.sh`. See that script's header for what
is and isn't verified about it — there's no real pending approval to test against until the check
exists. The ADO web UI (Pipelines → the running production build → "Review") always works as a
fallback.
