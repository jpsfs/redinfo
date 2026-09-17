#!/usr/bin/env bash
# Lists Contabo *standard* Ubuntu images and their UUIDs — the thing to put in
# `image_id` in infra/terraform/terraform.tfvars.
#
# This exists because the Terraform provider has no lookup-by-name: its
# `contabo_image` data source takes an id, not a name. And resolving the image
# dynamically at plan time would be actively dangerous — `image_id` is one of
# the attributes Contabo reinstalls the server for, so a newly published image
# would turn a routine plan into "wipe production". Hence: look it up here,
# once, by hand, and pin it.
#
# Usage:
#   infra/scripts/contabo-images.sh            # table of Ubuntu standard images
#   infra/scripts/contabo-images.sh --latest   # just the newest LTS image's UUID
#   infra/scripts/contabo-images.sh --latest --include-interim
#   infra/scripts/contabo-images.sh --all      # every standard image, not just Ubuntu
#
# Credentials come from the same four environment variables the Terraform
# provider reads (see infra/terraform/providers.tf):
#   CNTB_OAUTH2_CLIENT_ID CNTB_OAUTH2_CLIENT_SECRET CNTB_OAUTH2_USER CNTB_OAUTH2_PASS
set -euo pipefail

API="${CNTB_API:-https://api.contabo.com}"
TOKEN_URL="${CNTB_OAUTH2_TOKEN_URL:-https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token}"

LATEST_ONLY=false
INCLUDE_INTERIM=false
ALL_OS=false
for arg in "$@"; do
  case "$arg" in
    --latest) LATEST_ONLY=true ;;
    --include-interim) INCLUDE_INTERIM=true ;;
    --all) ALL_OS=true ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

for var in CNTB_OAUTH2_CLIENT_ID CNTB_OAUTH2_CLIENT_SECRET CNTB_OAUTH2_USER CNTB_OAUTH2_PASS; do
  if [ -z "${!var:-}" ]; then
    echo "error: $var is not set. See infra/terraform/providers.tf for where these come from." >&2
    exit 1
  fi
done

# OAuth2 resource-owner-password grant — what Contabo's API uses. --data-urlencode
# rather than -d so that a password with & or = in it survives.
token="$(curl -fsS -X POST "$TOKEN_URL" \
  --data-urlencode "client_id=${CNTB_OAUTH2_CLIENT_ID}" \
  --data-urlencode "client_secret=${CNTB_OAUTH2_CLIENT_SECRET}" \
  --data-urlencode "username=${CNTB_OAUTH2_USER}" \
  --data-urlencode "password=${CNTB_OAUTH2_PASS}" \
  --data-urlencode "grant_type=password" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

# x-request-id is mandatory on every Contabo API call, not optional.
request_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
images="$(curl -fsS "${API}/v1/compute/images?standardImage=true&size=100&page=1" \
  -H "Authorization: Bearer ${token}" \
  -H "x-request-id: ${request_id}")"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
printf '%s' "$images" > "$tmp"

# The JSON goes in as a file argument rather than on stdin, so that stdin is
# free to carry this script (a quoted heredoc, so nothing here is expanded by
# the shell and the Python can use whatever quoting it likes).
LATEST_ONLY="$LATEST_ONLY" INCLUDE_INTERIM="$INCLUDE_INTERIM" ALL_OS="$ALL_OS" \
python3 - "$tmp" <<'PY'
import json, os, re, sys

latest_only     = os.environ["LATEST_ONLY"] == "true"
include_interim = os.environ["INCLUDE_INTERIM"] == "true"
all_os          = os.environ["ALL_OS"] == "true"

rows = json.load(open(sys.argv[1])).get("data", [])
if not all_os:
    rows = [r for r in rows if "ubuntu" in (r.get("name", "") + r.get("description", "")).lower()]


def version_key(r):
    # Ubuntu versions are YY.MM; compare them numerically rather than as text
    # so that 24.04 sorts above 9.10, and 24.10 above 24.04.
    m = re.search(r"(\d+)\.(\d+)", r.get("version") or r.get("name") or "")
    return (int(m.group(1)), int(m.group(2))) if m else (-1, -1)


def is_lts(r):
    # Ubuntu LTS releases are the .04 of an even-numbered year; everything
    # else is a 9-month interim release with no business under a production
    # cluster.
    major, minor = version_key(r)
    return minor == 4 and major % 2 == 0


rows.sort(key=version_key, reverse=True)

if latest_only:
    candidates = rows if include_interim else [r for r in rows if is_lts(r)]
    if not candidates:
        sys.exit("no matching image found - re-run without --latest to see what is on offer")
    print(candidates[0]["imageId"])
else:
    if not rows:
        sys.exit("no images returned")
    print("{:38} {:28} {:8} {:4} {}".format("IMAGE ID", "NAME", "VERSION", "LTS", "DESCRIPTION"))
    for r in rows:
        print("{:38} {:28} {:8} {:4} {}".format(
            r["imageId"],
            (r.get("name") or "")[:28],
            (r.get("version") or "")[:8],
            "yes" if is_lts(r) else "no",
            (r.get("description") or "")[:40],
        ))
PY
