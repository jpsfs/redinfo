output "instance_id" {
  description = "Contabo instance id — what you quote in a support ticket, and what `cntb get instance <id>` takes."
  value       = contabo_instance.this.id
}

output "ipv4" {
  description = "Public IPv4. This is the A record to point the application hostname at once the migration happens."
  value       = try(contabo_instance.this.ip_config[0].v4[0].ip, null)
}

output "ipv6" {
  description = "Public IPv6, if the instance got one."
  value       = try(contabo_instance.this.ip_config[0].v6[0].ip, null)
}

output "ssh" {
  description = "Ready-made SSH command for the admin user."
  value       = "ssh ${var.admin_user}@${try(contabo_instance.this.ip_config[0].v4[0].ip, "<pending>")}"
}

output "status" {
  description = "Provisioning status as Contabo last reported it (running / provisioning / installing / error / ...). `running` means the VM booted, NOT that cloud-init finished — check /var/lib/redinfo-bootstrap.done on the host, or run infra/scripts/verify-cluster.sh."
  value       = contabo_instance.this.status
}

output "specs" {
  description = "What was actually provisioned, as reported back by the API — worth eyeballing against the product you meant to buy."
  value = {
    product_id   = contabo_instance.this.product_id
    product_type = contabo_instance.this.product_type
    cpu_cores    = contabo_instance.this.cpu_cores
    ram_mb       = contabo_instance.this.ram_mb
    disk_mb      = contabo_instance.this.disk_mb
    region       = contabo_instance.this.region
    os_type      = contabo_instance.this.os_type
  }
}
