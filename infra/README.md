# `infra/` — the Contabo host for production

Terraform that provisions **one Contabo Cloud VPS 6 running Ubuntu with a
microk8s cluster on it**, intended to become the production host in place of
`vm-redcross`. Moving the environment itself is out of scope here; what this
gives you is a machine that demonstrably *can* run it.

Nothing in this directory has been applied yet. It is written, formatted and
`terraform validate`-clean, but no VM has been bought — see "Before the first
apply" below for what is still needed.

```
infra/
  terraform/                 the root module (one VM, one SSH key, optional firewall)
    versions.tf              provider pin + S3 backend (partial config)
    providers.tf             credentials come from the environment, never a file
    variables.tf             every knob, with the reinstall hazards called out
    main.tf                  contabo_secret + contabo_instance + contabo_firewall
    cloud-init.yaml.tftpl    first-boot: microk8s, addons, ufw, fail2ban
    outputs.tf               ip, id, ssh command, what was actually provisioned
  scripts/
    contabo-images.sh        find the image_id for the newest Ubuntu LTS
    bootstrap-state-bucket.sh  create the S3 bucket that holds the state
    verify-host.sh           run ON the new host: prove it can run production
```

## What gets built

| | |
|---|---|
| Product | Cloud VPS 6 — `product_id = "V154"`, 6 vCPU / 12 GB RAM / 200 GB SSD |
| Region | `EU` (Germany) |
| OS | newest Ubuntu LTS standard image, pinned by UUID in `image_id` |
| Kubernetes | microk8s, snap channel `1.35/stable` |
| Addons | `dns`, `hostpath-storage`, `ingress`, `helm3`, `rbac`, `metrics-server` |
| Exposed | 80 and 443 to the world, 22 to `ssh_allowed_cidrs` |
| Not exposed | the Kubernetes API on 16443 (see below) |

The addon list is not arbitrary — it is exactly what `deploy/redinfo` needs.
In particular the `ingress` addon registers an IngressClass named **`public`**,
which is already what `deploy/redinfo/values.production.yaml` sets as
`ingress.className`. That match is the reason this cluster can take the
existing chart with no changes.

## Before the first apply

1. **Contabo API credentials.** Four values from the Contabo customer panel
   (Account → Security): client id, client secret, API user (your login
   email), API password. They belong in the `redinfo-contabo` Azure DevOps
   variable group; the provider reads them from `CNTB_OAUTH2_*` environment
   variables and they are never written to a file. See `providers.tf`.

2. **The state bucket.** Terraform state lives in S3. Create the bucket once:

   ```bash
   infra/scripts/bootstrap-state-bucket.sh --bucket redinfo-terraform-state --region eu-west-1
   ```

   It comes out versioned, encrypted, private and TLS-only, with a 90-day
   expiry on superseded versions. There is no DynamoDB lock table — the
   backend uses S3-native locking (`use_lockfile`), which is why
   `versions.tf` requires Terraform 1.10+.

3. **The image id.** `image_id` has no default on purpose:

   ```bash
   infra/scripts/contabo-images.sh --latest    # newest Ubuntu LTS, as a UUID
   ```

4. **An SSH public key** for `ssh_public_key`. Required: cloud-init disables
   SSH password authentication, so this key is the way in. If it is wrong, the
   way back is the VNC console in the Contabo panel.

## Running it

Through the pipeline (`.ado/infrastructure.yml`, manual runs only —
`plan` / `apply` / `destroy`, with `apply` and `destroy` gated behind a
confirmation checkbox), or locally:

```bash
export CNTB_OAUTH2_CLIENT_ID=... CNTB_OAUTH2_CLIENT_SECRET=...
export CNTB_OAUTH2_USER=... CNTB_OAUTH2_PASS=...

cp infra/terraform/backend.hcl.example       infra/terraform/backend.hcl
cp infra/terraform/terraform.tfvars.example  infra/terraform/terraform.tfvars
# fill both in

terraform -chdir=infra/terraform init -backend-config=backend.hcl
terraform -chdir=infra/terraform plan
```

`apply` **buys a server.** The minimum contract period is one month
(`var.period`), billed on creation.

## The four attributes that reinstall the machine

Contabo has no in-place edit for these: changing any one of them wipes and
reprovisions the instance.

- `image_id`
- `ssh_public_key` (via the `ssh_keys` secret id)
- `root_password` (never set here, deliberately — it would also put a real
  secret into Terraform state)
- `user_data`, i.e. **any edit to `cloud-init.yaml.tftpl`**

The last one is the trap. A one-line comment change in the cloud-init
template is, to Terraform, a change to an attribute of a running production
server. Read every plan that touches `contabo_instance.this`. For changes to a
live host, edit and re-run `/opt/redinfo/bootstrap.sh` on the box instead — it
is installed there and every step in it is idempotent.

## After it boots

```bash
ssh admin@<ipv4>                     # `terraform output ssh` prints this
sudo tail -f /var/log/redinfo-bootstrap.log
```

`/var/lib/redinfo-bootstrap.done` appears when the bootstrap script has
finished — which is a stronger claim than cloud-init's own "done", and is what
`verify-host.sh` checks.

Then, from a checkout of this repo **on that machine**:

```bash
infra/scripts/verify-host.sh
```

That does two things. First the infrastructure checks: bootstrap marker, node
Ready, CoreDNS, a default StorageClass, an IngressClass named `public`, and
80/443 actually bound. Then a real deploy — the production chart, the
production images, `values.production.yaml` — into a throwaway `prodtest`
namespace with generated throwaway secrets, followed by HTTP through the
frontend Service (the same probe the deploy pipeline uses) and HTTPS through
the ingress on the real port 443. It tears the namespace down afterwards
unless you pass `--keep`.

It deliberately does not enable the legacy-migration job or the INEM worker
(both need credentials it has no business holding), and never touches a
`production` namespace.

## TLS

Port 443 is served by the ingress controller's **built-in self-signed
certificate** for now. That is a deliberate interim choice: the port is
genuinely open and testable end to end, and the real certificate decision is
deferred to the migration rather than guessed at now.

Today's production origin (`vm-redcross`) is plain HTTP behind Cloudflare,
which terminates TLS for browsers; an earlier cert-manager attempt on that
cluster was reverted (see `deploy/redinfo/README.md`). When this host becomes
production, pick one:

- **cert-manager + Let's Encrypt (HTTP-01)** — self-contained, standard, needs
  port 80 reachable and the hostname resolving here during issuance.
- **Cloudflare Origin Certificate** — keep Cloudflare proxying, install its
  long-lived origin cert as the ingress TLS secret, set SSL mode to Full
  (strict).

Either way `env.backend.FRONTEND_URL` must stay `https://...`: it is used
verbatim to build the post-OAuth redirect, so an `http` value there breaks
Google/Microsoft login even when the origin itself never speaks TLS.

## Deploying the application to it

`.ado/infrastructure.yml` does both halves. It is manual-run only, and its
parameters are:

| Parameter | Meaning |
|---|---|
| `action` | `plan` / `apply` / `destroy` — the Terraform half |
| `confirm` | required checkbox for `apply` and `destroy` |
| `deployApp` | also deploy the application to the provisioned host |
| `imageTag` | `sha-<shortSha>`, or the moving `production` tag (default) |
| `enableBackgroundJobs` | legacy-migration cron + INEM worker — **off by default** |

The deploy stage runs on a *hosted* agent and reaches the host over SSH: this
machine has no ADO agent, and its Kubernetes API is closed to the internet by
design. It resolves the host's IP from Terraform state (never a hand-typed
parameter), copies the chart over as a tarball, renders the
`redinfo-production` secrets into a `0600` file on the far side — never onto a
command line — and runs `microk8s helm3 upgrade --install` into the
`production` namespace, with the same stale-lock clearance and `--atomic
--wait` as the existing deploy path. It then smoke-checks twice: through the
frontend Service on the host (the probe `.ado/templates/deploy-env.yml` uses)
and over the public internet on **443**, which is the part that is new here.

### `enableBackgroundJobs` is off for a reason

While `vm-redcross` is still live, a deploy here creates a *second* instance
holding the same production credentials. With the legacy-migration cron on,
two machines pull from the same legacy MySQL every hour. With the INEM worker
on, two headless browsers log into the same shared INEM account and fight over
one session. Neither fails at deploy time; both are the sort of thing noticed
days later. Turn the flag on at cutover, once the old host is off.

## Variable groups

| Group | Contains |
|---|---|
| `redinfo-contabo` | `CNTB_OAUTH2_*` (secret), `TF_VAR_image_id`, `TF_VAR_ssh_public_key`, `PROD_SSH_PRIVATE_KEY` (secret), `PROD_SSH_USER`, `PROD_INGRESS_HOST` |
| `redinfo-tfstate` | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (secret), `TFSTATE_BUCKET`, `TFSTATE_KEY`, `TFSTATE_REGION` |
| `redinfo-production` | the existing application secrets, reused as-is |

Anything still reading `REPLACE_ME` has to be filled in before a run.

## Deploys, and why 16443 is closed

`kube_api_allowed_cidrs` is empty by default, so the Kubernetes API is not
reachable from the internet. That mirrors how deploys work today: the Azure
DevOps self-hosted agent runs *on* the cluster machine, so there is no SSH hop
and no exposed API (`.ado/templates/deploy-env.yml`). To deploy to this host
the same way, install an ADO agent on it and add its service account to the
`microk8s` group — the pipeline's preflight step checks exactly that and says
so if it is missing.

The alternative — opening 16443 to fixed addresses and deploying remotely — is
one variable away, but it is a real change in exposure, not a convenience
setting.
