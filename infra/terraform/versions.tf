terraform {
  # 1.10+ is a hard floor, not a preference: the S3 backend below uses
  # `use_lockfile` (S3-native conditional-write locking), which replaced the
  # old DynamoDB lock table. Without it we would have to provision and pay for
  # a DynamoDB table purely to serialise `apply` runs.
  required_version = ">= 1.10.0"

  required_providers {
    contabo = {
      source = "contabo/contabo"
      # Contabo's provider is pre-1.0 and does not promise a stable interface
      # between patch releases, so this is pinned to an exact version rather
      # than a `~>` range. Bump deliberately, and re-read the changelog when
      # you do: `image_id`, `ssh_keys`, `root_password` and `user_data` all
      # REINSTALL the server when they change (see main.tf).
      version = "0.1.44"
    }
  }

  # Partial configuration on purpose — bucket/key/region are supplied at init
  # time so that no account-specific detail is committed here:
  #
  #   terraform init -backend-config=backend.hcl
  #
  # See backend.hcl.example, and infra/scripts/bootstrap-state-bucket.sh for
  # creating the bucket itself (it cannot live in this state — it is what
  # holds this state).
  backend "s3" {}
}
