# The SSH key, stored in Contabo's Secret Management API so the instance can
# reference it by id. Only the *public* key lives here, so it is safe in state
# and in the panel.
resource "contabo_secret" "ssh" {
  name  = "${var.name}-ssh"
  type  = "ssh"
  value = var.ssh_public_key
}

# The production host: one Cloud VPS 6 running Ubuntu, with microk8s brought
# up by cloud-init (see cloud-init.yaml.tftpl).
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
  })
}

# Optional second layer in front of ufw — see var.cloud_firewall_enabled for
# why this is off by default. The rules deliberately mirror the host ones:
# 22 from ssh_allowed_cidrs, 80 and 443 from the whole internet (80 is not
# decoration — it is what an ACME HTTP-01 challenge and the plain-HTTP →
# HTTPS redirect need).
resource "contabo_firewall" "this" {
  count = var.cloud_firewall_enabled ? 1 : 0

  name        = var.name
  description = "redinfo production: ssh + http + https"
  status      = "active"

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
      dest_ports = ["80", "443"]
      src_cidr {
        ipv4 = ["0.0.0.0/0"]
      }
    }
  }
}
