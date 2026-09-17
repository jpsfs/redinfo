# Deliberately empty: every credential is read from the environment by the
# provider itself, so nothing secret is ever written to a .tf/.tfvars file on
# disk or passed on a command line.
#
#   CNTB_OAUTH2_CLIENT_ID      account secret, Contabo CCP → Account → Security
#   CNTB_OAUTH2_CLIENT_SECRET  idem
#   CNTB_OAUTH2_USER           the API user (your CCP login email)
#   CNTB_OAUTH2_PASS           the API password (set in CCP, NOT the CCP login password)
#
# In CI these four come from the `redinfo-contabo` Azure DevOps variable group
# (see .ado/infrastructure.yml). Locally, export them for the shell that runs
# terraform. `CNTB_API` and `CNTB_OAUTH2_TOKEN_URL` also exist and already
# default to the right values — leave them unset.
provider "contabo" {}
