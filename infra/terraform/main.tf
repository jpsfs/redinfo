# The SSH key, stored in Contabo's Secret Management API so the instance can
# reference it by id. Only the *public* key lives here, so it is safe in state
# and in the panel.
resource "contabo_secret" "ssh" {
  name  = "${var.name}-ssh"
  type  = "ssh"
  value = var.ssh_public_key
}

# The production host: one Cloud VPS 6 running Ubuntu on a 12-month term
# (var.period), with microk8s brought up by cloud-init (see
# cloud-init.yaml.tftpl).
#
# Auto Backup is NOT ordered here, and cannot be: the provider's `add_ons`
# block is read-only in practice — resource_instance.go populates it from the
# API response and never puts it into the create or patch request, so writing
# one has no effect at all. Order Auto Backup in the Contabo panel (or in the
# web order form, alongside the term). See infra/README.md.
#
# Four attributes here REINSTALL the machine when they change — image_id,
# ssh_keys, root_password and user_data. `user_data` is the one to watch: an
# innocuous edit to the cloud-init template is, to Terraform, a change to this
# attribute, and the plan will propose reprovisioning production. Read every
# plan on this resource. `root_password` is intentionally never set: with an
# SSH key present there is no need for one, and setting it would put a real
# secret into Terraform state.
resource "contabo_instance" "this" {
  display_name = var.name
  product_id   = var.product_id
  region       = var.region
  period       = var.period
  image_id     = var.image_id
  default_user = var.admin_user

  # Non-empty only when the machine was bought outside Terraform — the
  # provider then skips creation and manages that instance instead (see
  # var.existing_instance_id). null, not "", so the attribute stays unset.
  existing_instance_id = var.existing_instance_id != "" ? var.existing_instance_id : null

  # `ssh_keys` is a list of *numeric* secret ids; contabo_secret exposes its
  # id as a string, hence the conversion.
  ssh_keys = [tonumber(contabo_secret.ssh.id)]

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    hostname         = var.name
    admin_user       = var.admin_user
    timezone         = var.timezone
    microk8s_channel = var.microk8s_channel
    # Space-separated rather than lists: the template loops over them in bash.
    # See the note at the top of cloud-init.yaml.tftpl for why `%{ for }`
    # directives are not used inside that file.
    microk8s_addons           = join(" ", var.microk8s_addons)
    ssh_allowed_cidrs         = join(" ", var.ssh_allowed_cidrs)
    kube_api_allowed_cidrs    = join(" ", var.kube_api_allowed_cidrs)
    disable_ssh_password_auth = var.disable_ssh_password_auth
    ado_organization_url      = var.ado_organization_url
    ado_agent_pool            = var.ado_agent_pool
    ado_agent_version         = var.ado_agent_version
  })
}

# Second layer in front of ufw, mirroring the firewall set up by hand in the
# Contabo panel: 443 from anywhere, 22 from ssh_allowed_cidrs, everything else
# dropped.
#
# The "block all traffic / DROP / Any" row visible in the panel has no
# equivalent here on purpose: Contabo's model is a list of accept rules with an
# implicit default-deny behind it — the provider's `action` accepts only
# "accept" — and the panel simply renders that default as a row. There is also
# no outbound rule support, in the panel or here; outbound is unrestricted.
#
# If the hand-made firewall is to be kept (rather than a second one created
# beside it), import it first — see var.firewall_name.
resource "contabo_firewall" "this" {
  count = var.cloud_firewall_enabled ? 1 : 0

  name        = var.firewall_name
  description = "redinfo production: https from anywhere, ssh from vm-redcross"
  status      = "active"

  # This assignment is the whole reason the firewall is managed here rather
  # than left entirely to the panel: a firewall with no instances protects
  # nothing, and "Assigned VPS/VDS: 0" is easy to leave that way.
  instance_ids = [tonumber(contabo_instance.this.id)]

  rules {
    inbound {
      protocol   = "tcp"
      action     = "accept"
      status     = "active"
      dest_ports = ["22"]
      src_cidr {
        ipv4 = var.ssh_allowed_cidrs
      }
    }

    inbound {
      protocol   = "tcp"
      action     = "accept"
      status     = "active"
      dest_ports = var.public_tcp_ports
      src_cidr {
        ipv4 = ["0.0.0.0/0"]
      }
    }
  }
}

# Adopt the firewall that already exists in the Contabo panel rather than
# creating a second one beside it (see var.firewall_import_id). Declarative
# import, not a one-off `terraform import` command, so that it is visible in
# the plan, runs identically in the pipeline, and is a no-op once the firewall
# is in state.
#
# for_each rather than count: when the firewall is disabled or no id is given
# there is no contabo_firewall.this[0] for this block to point at, and an
# import block targeting a resource that does not exist is an error.
import {
  for_each = var.cloud_firewall_enabled && var.firewall_import_id != "" ? toset([var.firewall_import_id]) : toset([])

  to = contabo_firewall.this[0]
  id = each.value
}
