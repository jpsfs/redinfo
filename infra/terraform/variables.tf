# ─────────────────────────────── identity ────────────────────────────────

variable "name" {
  description = <<-EOT
    Base name for everything this module creates: the instance's display name
    in the Contabo panel, its hostname, the SSH-key secret, and the cloud
    firewall. Keep it DNS-safe — it is used verbatim as the machine hostname.
  EOT
  type        = string
  default     = "redinfo-prod"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.name))
    error_message = "name must be a lowercase DNS label (letters, digits, dashes; not starting or ending with a dash)."
  }
}

# ──────────────────────────────── product ────────────────────────────────

variable "product_id" {
  description = <<-EOT
    Contabo product to buy. V154 is "Cloud VPS 6" (6 vCPU / 12 GB RAM /
    200 GB SSD) — the size this environment was specified at. The current
    Cloud VPS line is V153=4, V154=6, V155=8, V156=12, V157=16, V158=18, with
    V159-V164 the "Plus" (AMD EPYC / NVMe) equivalents. The authoritative
    table is the productId description at https://api.contabo.com (see
    Instances → createInstance).

    CAUTION: changing this on an existing instance is an upgrade/downgrade of
    a running production machine. Contabo cannot shrink a disk, so downgrades
    are refused.
  EOT
  type        = string
  default     = "V154"

  validation {
    condition     = can(regex("^V[0-9]+$", var.product_id))
    error_message = "product_id must look like V154."
  }
}

variable "region" {
  description = "Contabo region. EU is Germany (Nuremberg) — closest to the Portuguese user base and the only one with our data-residency story."
  type        = string
  default     = "EU"

  validation {
    condition     = contains(["EU", "UK", "US-central", "US-east", "US-west", "SIN", "JPN", "IND", "AUS"], var.region)
    error_message = "region must be one of EU, UK, US-central, US-east, US-west, SIN, JPN, IND, AUS."
  }
}

variable "period" {
  description = <<-EOT
    Initial contract period in months (1, 3, 6 or 12). This is a real
    purchase: `terraform apply` orders the machine and the first period is
    billed immediately. 1 keeps the commitment minimal while the migration is
    still being proven out; raise it once this machine is the real production
    host.
  EOT
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 3, 6, 12], var.period)
    error_message = "period must be 1, 3, 6 or 12."
  }
}

variable "image_id" {
  description = <<-EOT
    UUID of the Contabo standard image to install — the newest Ubuntu LTS
    they offer. There is no lookup-by-name data source in the provider
    (`contabo_image` takes an id, not a name), and the ids are account-visible
    only, so this is an explicit input rather than something resolved at plan
    time. Get it with:

        infra/scripts/contabo-images.sh          # lists Ubuntu standard images
        infra/scripts/contabo-images.sh --latest # just the newest one's UUID

    Resolving it dynamically would be worse, not better: `image_id` is one of
    the fields Contabo REINSTALLS the server for when it changes, so a plan
    that silently picked up a newly-published image would propose wiping
    production. Pin it, and bump it only as a deliberate rebuild.
  EOT
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.image_id))
    error_message = "image_id must be a UUID — run infra/scripts/contabo-images.sh to find it."
  }
}

# ──────────────────────────────── access ─────────────────────────────────

variable "ssh_public_key" {
  description = <<-EOT
    Public SSH key (the full one-line `ssh-ed25519 AAAA... comment` form)
    installed for `admin_user` at provisioning time. Required, and required
    to be correct: cloud-init turns off SSH password authentication, so this
    key is how anyone gets in. The fallback if it is wrong is the VNC console
    in the Contabo panel, not a password prompt.

    CAUTION: changing this REINSTALLS the server (Contabo applies SSH keys
    during installation only). To rotate a key on a live machine, edit
    ~/.ssh/authorized_keys over SSH and update this value with
    `terraform apply -refresh-only` reasoning in mind — or accept the rebuild.
  EOT
  type        = string

  validation {
    condition     = can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) ", var.ssh_public_key))
    error_message = "ssh_public_key must be an OpenSSH public key line (ssh-ed25519 / ssh-rsa / ecdsa-sha2-nistp256 ...)."
  }
}

variable "admin_user" {
  description = <<-EOT
    Contabo's `defaultUser`. Only `admin` or `root` are accepted for Linux.
    `admin` (a sudoer, not root) is the safer default and is what cloud-init
    adds to the `microk8s` group so that `kubectl`/`helm` work without sudo.
  EOT
  type        = string
  default     = "admin"

  validation {
    condition     = contains(["admin", "root"], var.admin_user)
    error_message = "admin_user must be 'admin' or 'root' (Contabo only accepts those for Linux)."
  }
}

variable "ssh_allowed_cidrs" {
  description = <<-EOT
    Sources allowed to reach port 22 in the host firewall (ufw), and in the
    Contabo cloud firewall when cloud_firewall_enabled is on.

    Defaults to vm-redcross' own egress address only. That machine is where
    this repo's operator tooling runs and where the deploy agent lives today,
    so it is the one place that genuinely needs shell access to the new host;
    everything else (deploys, helm, kubectl) happens on the box itself via the
    ADO agent, not over SSH.

    Two things to know before changing it:
      * Getting this wrong locks you out. The Contabo panel's VNC console is
        the break-glass path — it does not go through ufw.
      * The address below is vm-redcross' *current* public IP. If that
        machine's address changes, or it is decommissioned at cutover, this
        list has to be updated in the same breath or SSH goes dark.
  EOT
  type        = list(string)
  default     = ["188.83.117.135/32"]
}

variable "kube_api_allowed_cidrs" {
  description = <<-EOT
    Sources allowed to reach the Kubernetes API on 16443. Empty by default —
    the API stays local to the machine, which is why deploys run *on* the box
    (the ADO self-hosted agent pattern already used for vm-redcross) rather
    than over the network. Only open this if you deliberately want remote
    kubectl/helm, and then only to fixed addresses: microk8s' API is protected
    by certs but is still the whole cluster.
  EOT
  type        = list(string)
  default     = []
}

variable "disable_ssh_password_auth" {
  description = "Turn off SSH password authentication in cloud-init. Keep true; ssh_public_key is mandatory, so there is always a way in, and the Contabo panel's VNC console is the break-glass path."
  type        = bool
  default     = true
}

# ─────────────────────────────── platform ────────────────────────────────

variable "microk8s_channel" {
  description = <<-EOT
    Snap channel for microk8s, i.e. the Kubernetes minor version. Pinned to a
    specific track rather than `latest/stable` so that a rebuild of this
    machine six months from now installs the same Kubernetes, and so that
    minor-version upgrades are a deliberate edit here.

    1.35/stable is one track behind the newest at the time of writing
    (1.36/stable) — far enough back to have patch releases behind it, recent
    enough to be supported. `snap info microk8s` lists what exists.
  EOT
  type        = string
  default     = "1.35/stable"
}

variable "microk8s_addons" {
  description = <<-EOT
    Addons enabled at first boot, in this order. These are exactly the pieces
    the redinfo Helm chart assumes:

      dns              CoreDNS — every service-to-service call needs it
      hostpath-storage default StorageClass, backing the postgresql and
                       uploads PVCs (deploy/redinfo/templates/pvc-uploads.yaml)
      ingress          ingress-nginx as a host-network DaemonSet, binding 80
                       and 443 on the host. Its IngressClass is named `public`,
                       which is what deploy/redinfo/values.production.yaml
                       already sets as `ingress.className`
      helm3            the `microk8s.helm3` binary the deploy pipeline looks
                       for first (.ado/templates/deploy-env.yml)
      rbac             on by policy; the chart does not need it, but an
                       internet-facing cluster should have it
      metrics-server   `kubectl top`, and HPA later if it is ever wanted

    Note `cert-manager` is deliberately NOT here — TLS is currently the
    ingress' built-in self-signed certificate, see infra/README.md.
  EOT
  type        = list(string)
  default     = ["dns", "hostpath-storage", "ingress", "helm3", "rbac", "metrics-server"]
}

variable "timezone" {
  description = "Host timezone. Europe/Lisbon so that logs, cron (the hourly legacy-migration job) and any on-box timestamp read the same as the people operating it."
  type        = string
  default     = "Europe/Lisbon"
}

# ───────────────────────────── cloud firewall ────────────────────────────

variable "cloud_firewall_enabled" {
  description = <<-EOT
    Also create a Contabo *cloud* firewall in front of the instance, on top of
    the host's own ufw rules. Off by default: ufw is unconditional, free and
    self-contained, while the cloud firewall is a separate Contabo product
    whose availability varies by account — turning it on when the account
    cannot use it fails the apply *after* the machine has been bought.

    Turn it on for belt-and-braces once the account is known to support it;
    the rules mirror the ufw ones (22 from ssh_allowed_cidrs, 80 and 443 from
    anywhere).
  EOT
  type        = bool
  default     = false
}

# ───────────────────────── azure devops agent ────────────────────────────
#
# cloud-init stages the agent but does NOT register it — registration needs a
# PAT, and a PAT in user_data would be stored in Terraform state, visible in
# the Contabo panel, and (because user_data changes reinstall the machine)
# would make rotating it mean rebuilding production. One command on the host
# finishes the job; see infra/README.md.

variable "ado_organization_url" {
  description = "Azure DevOps organization the agent registers into."
  type        = string
  default     = "https://dev.azure.com/jpsfs"
}

variable "ado_agent_pool" {
  description = <<-EOT
    Agent pool this host joins. `contabo-production` is a pool of its own
    rather than a second agent in `vm-redcross`: a pool is the unit a pipeline
    stage targets, so keeping them separate is what lets the old and new
    production hosts be deployed to independently during the migration — and
    what stops a job meant for one landing on the other.
  EOT
  type        = string
  default     = "contabo-production"
}

variable "ado_agent_version" {
  description = <<-EOT
    Pinned agent release (https://github.com/microsoft/azure-pipelines-agent).
    Pinned rather than "latest" so a rebuild of this machine installs the same
    agent; the agent self-updates when the service requires it anyway, so this
    is a floor, not a ceiling.
  EOT
  type        = string
  default     = "5.279.0"
}
