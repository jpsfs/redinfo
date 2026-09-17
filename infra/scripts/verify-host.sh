#!/usr/bin/env bash
# Proves a freshly-provisioned host can actually run production.
#
# Run it ON the new machine, from a checkout of this repo:
#   ssh admin@<ip>
#   git clone <repo> redinfo && cd redinfo
#   infra/scripts/verify-host.sh
#
# Two halves, and the second is the one that matters:
#
#   1. Infrastructure — cloud-init finished, the node is Ready, the addons the
#      chart depends on are on, 80 and 443 are actually bound on the public
#      interface.
#   2. A real deploy — the production Helm chart, the production images, the
#      production values, into a throwaway namespace with throwaway secrets;
#      then HTTP through the frontend Service *and* HTTPS through the ingress.
#      Torn down afterwards unless --keep.
#
# What it deliberately does NOT do: touch the real `production` namespace, use
# any real secret, enable the legacy-migration job or the INEM worker (both
# need credentials this script has no business holding), or point DNS anywhere.
set -euo pipefail

NAMESPACE="prodtest"
RELEASE="redinfo-prodtest"
INGRESS_HOST="prodtest.redinfo.invalid"
IMAGE_TAG="production"
KEEP=false
SKIP_DEPLOY=false
LOCAL_PORT=18080

while [ $# -gt 0 ]; do
  case "$1" in
    --namespace) NAMESPACE="${2:?}"; shift 2 ;;
    --image-tag) IMAGE_TAG="${2:?}"; shift 2 ;;
    --host) INGRESS_HOST="${2:?}"; shift 2 ;;
    --keep) KEEP=true; shift ;;
    --skip-deploy) SKIP_DEPLOY=true; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHART="${REPO_ROOT}/deploy/redinfo"

# Same binary resolution as .ado/templates/deploy-env.yml: microk8s.* first,
# bare names as a fallback. Keeping the two in step is the point — if this
# script can find them, so can the deploy pipeline's agent.
resolve_bin() { command -v "$1" 2>/dev/null || command -v "$2" 2>/dev/null || true; }
KUBECTL="$(resolve_bin microk8s.kubectl kubectl)"
HELM="$(resolve_bin microk8s.helm3 helm)"

fails=0
pass() { printf '  \033[32mok\033[0m   %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fails=$((fails + 1)); }
info() { printf '  ..   %s\n' "$*"; }
section() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ── 1. infrastructure ──────────────────────────────────────────────────────

section "Host bootstrap"
if [ -f /var/lib/redinfo-bootstrap.done ]; then
  pass "cloud-init bootstrap completed at $(cat /var/lib/redinfo-bootstrap.done)"
else
  # cloud-init reporting "done" is not the same claim as our bootstrap script
  # having got to the end of its own work — check for our marker specifically.
  fail "/var/lib/redinfo-bootstrap.done missing — see /var/log/redinfo-bootstrap.log"
fi

section "Cluster"
if [ -z "$KUBECTL" ] || [ -z "$HELM" ]; then
  fail "kubectl and/or helm not on PATH (looked for microk8s.kubectl/microk8s.helm3 too)"
  echo; echo "Cannot continue without a cluster client."; exit 1
fi
pass "kubectl=${KUBECTL} helm=${HELM}"

if $KUBECTL get nodes -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q True; then
  pass "node Ready — $($KUBECTL get nodes --no-headers | awk '{print $1, $3, $5}')"
else
  fail "no Ready node"
fi

# The chart's hard dependencies, each checked by what it actually provides
# rather than by parsing `microk8s status` output.
if $KUBECTL -n kube-system get svc kube-dns >/dev/null 2>&1; then
  pass "dns addon (CoreDNS service present)"
else
  fail "dns addon missing — every service-to-service call in the chart needs it"
fi

default_sc="$($KUBECTL get storageclass -o jsonpath='{.items[?(@.metadata.annotations.storageclass\.kubernetes\.io/is-default-class=="true")].metadata.name}' 2>/dev/null || true)"
if [ -n "$default_sc" ]; then
  pass "default StorageClass: ${default_sc} (backs the postgresql and uploads PVCs)"
else
  fail "no default StorageClass — the postgresql and uploads PVCs will stay Pending"
fi

# values.production.yaml sets ingress.className: public, which is the name the
# microk8s ingress addon registers. A mismatch here is the failure where
# everything deploys green and nothing is reachable.
if $KUBECTL get ingressclass public >/dev/null 2>&1; then
  pass "IngressClass 'public' exists (matches deploy/redinfo/values.production.yaml)"
else
  fail "no IngressClass named 'public' — values.production.yaml's ingress.className will match nothing"
fi

section "Public ports"
for port in 80 443; do
  if (ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) | grep -qE "[:.]${port}[[:space:]]"; then
    pass "port ${port} is bound on this host"
  else
    fail "nothing is listening on port ${port}"
  fi
done

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  pass "ufw active"
  ufw status | sed 's/^/       /'
else
  info "ufw not active (fine if you rely on the Contabo cloud firewall instead)"
fi

if $SKIP_DEPLOY; then
  section "Result"
  [ "$fails" -eq 0 ] && { echo "  infrastructure checks passed (deploy skipped)"; exit 0; }
  echo "  ${fails} check(s) failed"; exit 1
fi

# ── 2. a real, production-shaped deploy ────────────────────────────────────

section "Test deploy (namespace ${NAMESPACE}, images :${IMAGE_TAG})"

SECRETS_FILE="$(mktemp)"
chmod 600 "$SECRETS_FILE"
cleanup() {
  rm -f "$SECRETS_FILE"
  if ! $KEEP; then
    echo
    echo "==> tearing down ${RELEASE} / namespace ${NAMESPACE}"
    $HELM uninstall "$RELEASE" -n "$NAMESPACE" >/dev/null 2>&1 || true
    # The uploads PVC carries helm.sh/resource-policy: keep, so `helm
    # uninstall` deliberately leaves it behind. Deleting the namespace is what
    # actually reclaims it — correct here precisely because this namespace is
    # throwaway, and exactly what you must NOT do to the real one.
    $KUBECTL delete namespace "$NAMESPACE" --wait=false >/dev/null 2>&1 || true
  else
    echo
    echo "==> --keep: leaving ${RELEASE} running in ${NAMESPACE}"
    echo "    clean up with: ${HELM} uninstall ${RELEASE} -n ${NAMESPACE} && ${KUBECTL} delete ns ${NAMESPACE}"
  fi
}
trap cleanup EXIT

# Throwaway secrets, generated per run. Shaped exactly like the real ones
# (IDENTITY_ENCRYPTION_KEYS is `id:base64-of-32-bytes`, see
# scripts/validate-env.js) so that the backend's own startup validation is
# genuinely exercised rather than bypassed.
cat > "$SECRETS_FILE" <<YAML
secrets:
  JWT_SECRET: "$(openssl rand -hex 32)"
  IDENTITY_ENCRYPTION_KEYS: "k1:$(openssl rand -base64 32)"
postgresql:
  auth:
    password: "$(openssl rand -hex 16)"
    postgresPassword: "$(openssl rand -hex 16)"
YAML

# Production's own values file, with only the things that need real
# credentials or real data turned off. Everything structural — the ingress
# class, the PVCs, the seed job, resource requests — stays as production has
# it, because that is the part being tested.
$HELM upgrade --install "$RELEASE" "$CHART" \
  -n "$NAMESPACE" --create-namespace \
  -f "${CHART}/values.production.yaml" \
  -f "$SECRETS_FILE" \
  --set-string image.backend.tag="$IMAGE_TAG" \
  --set-string image.frontend.tag="$IMAGE_TAG" \
  --set legacyMigration.enabled=false \
  --set legacyMigration.cron.enabled=false \
  --set inemWorker.enabled=false \
  --set uploads.size=1Gi \
  --set postgresql.primary.persistence.size=2Gi \
  --set-string env.backend.FRONTEND_URL="https://${INGRESS_HOST}" \
  --set-string "ingress.hosts[0].host=${INGRESS_HOST}" \
  --set-string "ingress.hosts[0].paths[0].path=/" \
  --set-string "ingress.hosts[0].paths[0].service=frontend" \
  --set "ingress.hosts[0].paths[0].servicePort=80" \
  --history-max 3 --atomic --timeout 20m --wait

section "Smoke check"

# (a) through the frontend Service, exactly as the deploy pipeline does it
# (.ado/templates/deploy-env.yml) — this exercises nginx → backend proxying,
# which pod readiness alone does not prove.
SVC="$($KUBECTL -n "$NAMESPACE" get svc -l app.kubernetes.io/component=frontend -o name | head -1)"
if [ -z "$SVC" ]; then
  fail "no frontend Service found in ${NAMESPACE}"
else
  $KUBECTL -n "$NAMESPACE" port-forward "$SVC" "${LOCAL_PORT}:80" >/tmp/redinfo-pf.log 2>&1 &
  PF_PID=$!
  trap 'kill ${PF_PID} >/dev/null 2>&1 || true; cleanup' EXIT
  sleep 3

  check_svc() {
    local path="$1" deadline=$((SECONDS + 60))
    while [ $SECONDS -lt $deadline ]; do
      if curl -fsS -o /dev/null "http://127.0.0.1:${LOCAL_PORT}${path}" 2>/dev/null; then
        pass "service ${path} → 200"; return 0
      fi
      sleep 3
    done
    fail "service ${path} never returned 200 within 60s"
    sed 's/^/       /' /tmp/redinfo-pf.log >&2 || true
    return 1
  }
  check_svc "/" || true
  check_svc "/api/health" || true
fi

# (b) through the ingress on the real public ports — the part that is new on
# this machine. -k because TLS is currently the ingress controller's built-in
# self-signed certificate (see infra/README.md); --resolve so the Host header
# matches the Ingress rule without touching DNS.
check_ingress() {
  local scheme="$1" port="$2" path="$3" deadline=$((SECONDS + 60))
  while [ $SECONDS -lt $deadline ]; do
    code="$(curl -sk -o /dev/null -w '%{http_code}' \
      --resolve "${INGRESS_HOST}:${port}:127.0.0.1" \
      "${scheme}://${INGRESS_HOST}:${port}${path}" 2>/dev/null || true)"
    case "$code" in
      200) pass "${scheme} :${port} ${path} → 200"; return 0 ;;
      # ingress-nginx answers plain HTTP with a 308 to https by default; that
      # is a working ingress, not a failure.
      301|308) pass "${scheme} :${port} ${path} → ${code} (redirect to https)"; return 0 ;;
    esac
    sleep 3
  done
  fail "${scheme} :${port} ${path} never answered (last code: ${code:-none})"
  return 1
}
check_ingress http 80 / || true
check_ingress https 443 / || true
check_ingress https 443 /api/health || true

if curl -sk --resolve "${INGRESS_HOST}:443:127.0.0.1" "https://${INGRESS_HOST}/" -o /dev/null -w '' 2>/dev/null; then
  cert_subject="$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$INGRESS_HOST" 2>/dev/null | openssl x509 -noout -subject -issuer 2>/dev/null || true)"
  [ -n "$cert_subject" ] && info "certificate on 443: ${cert_subject//$'\n'/ | }"
fi

section "Result"
if [ "$fails" -eq 0 ]; then
  echo "  All checks passed — this host can run the production stack."
  exit 0
fi
echo "  ${fails} check(s) failed."
exit 1
