#!/usr/bin/env bash
# Approve a pending production deploy from the CLI, without opening the ADO
# web UI.
#
# STATUS: UNVERIFIED END TO END. The `redinfo-production` Environment has no
# approval check attached yet (see .ado/deployment.yml's DeployProduction
# comment) — it gets created separately, once the rest of this pipeline
# redesign proves out on a real self-hosted deploy. Until then there is no
# real pending approval anywhere in this project to exercise this script
# against, so everything below is written against the documented Azure
# DevOps REST API shape and the `az devops invoke` calls that were possible
# to verify (listed inline, each marked with what was actually confirmed),
# not against a real approval. Treat a clean run of this script as a good
# sign, not proof — check the run URL it prints either way.
#
# Verified building blocks (this org/project, confirmed with real 200s):
#   - List pending approvals (project-wide):
#       az devops invoke --org https://dev.azure.com/jpsfs \
#         --area approval --resource approvals \
#         --route-parameters project=redinfo \
#         --query-parameters state=pending --api-version 7.1 --http-method GET
#     Confirmed 200, returns {count, value} (empty today — no approval check
#     exists yet to produce a pending one).
#   - Get one approval by id:
#       az devops invoke --org https://dev.azure.com/jpsfs \
#         --area approval --resource approvals \
#         --route-parameters project=redinfo \
#         --query-parameters approvalIds=<guid> --api-version 7.1 --http-method GET
#     Confirmed 200.
#   - `az devops invoke` crashes on two-dot preview api-versions
#     (`7.1-preview.1` -> "could not convert string to float: '7.1.1'") — use
#     plain `7.1`, or the single-dot `7.1-preview` form if a preview flag is
#     ever required.
#
# NOT verified (documented shape only, from
# https://learn.microsoft.com/rest/api/azure/devops/approvalsandchecks/approvals/):
#   - The Approval object itself carries no build/run/environment id — only
#     id/status/steps/minRequiredApprovers. Correlating "the pending approval"
#     to "this specific production run" therefore goes through the build
#     timeline instead (records of type `Checkpoint.Approval`, a child of the
#     stage's `Checkpoint` record) — never exercised against a real approval
#     check, so treat this correlation as the most likely thing to need
#     fixing once one actually exists.
#   - The PATCH body/shape below (array of {approvalId, status, comment}).
#
# MANUAL FALLBACK — if this script fails or the correlation above turns out
# to be wrong, approve directly:
#   1. Find the pending approval id, either from the ADO UI (Pipelines > the
#      running production build > it'll show "Waiting for approval" with a
#      Review/Approve link — the id is in that link's URL) or:
#        az devops invoke --org https://dev.azure.com/jpsfs \
#          --area approval --resource approvals \
#          --route-parameters project=redinfo \
#          --query-parameters state=pending --api-version 7.1 --http-method GET
#   2. Approve it:
#        cat > /tmp/approve.json <<'EOF'
#        [ { "approvalId": "<guid-from-step-1>", "status": "approved", "comment": "Approved via manual fallback" } ]
#        EOF
#        az devops invoke --org https://dev.azure.com/jpsfs \
#          --area approval --resource approvals \
#          --route-parameters project=redinfo \
#          --api-version 7.1 --http-method PATCH --in-file /tmp/approve.json
#
# Usage:
#   scripts/ado-approve-production.sh ["optional approval comment"]

set -euo pipefail

ORG="https://dev.azure.com/jpsfs"
PROJECT="redinfo"
PIPELINE_ID=4
COMMENT="${1:-Approved via scripts/ado-approve-production.sh}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1" >&2; exit 2; }
}
need az
need jq

echo "Looking for an in-progress run of pipeline ${PIPELINE_ID} on env/production..."

RUN_JSON=$(az devops invoke --org "${ORG}" \
  --area build --resource builds \
  --route-parameters project="${PROJECT}" \
  --query-parameters definitions="${PIPELINE_ID}" 'branchName=refs/heads/env/production' 'statusFilter=inProgress,notStarted' '$top=5' \
  --api-version 7.1 --http-method GET -o json)

RUN_ID=$(echo "${RUN_JSON}" | jq -r '.value[0].id // empty')
RUN_URL=$(echo "${RUN_JSON}" | jq -r '.value[0]._links.web.href // empty')

if [ -z "${RUN_ID}" ]; then
  echo "No in-progress or not-started production run found for pipeline ${PIPELINE_ID}." >&2
  echo "Nothing to approve. If a run is actually waiting, check its status manually:" >&2
  echo "  az pipelines runs list --org ${ORG} --project ${PROJECT} --pipeline-ids ${PIPELINE_ID} --branch env/production --top 5" >&2
  exit 1
fi

echo "Found run ${RUN_ID}: ${RUN_URL}"
echo "Fetching its timeline to locate a pending Checkpoint.Approval record..."

TIMELINE_JSON=$(az devops invoke --org "${ORG}" \
  --area build --resource timeline \
  --route-parameters project="${PROJECT}" buildId="${RUN_ID}" \
  --api-version 7.1 --http-method GET -o json)

APPROVAL_IDS=$(echo "${TIMELINE_JSON}" | jq -r '
  [.records[] | select(.type == "Checkpoint.Approval" or (.type | test("Approval"; "i"))) | .id]
  | unique | .[]
')

if [ -z "${APPROVAL_IDS}" ]; then
  echo "##[error] No Checkpoint.Approval (or similarly named) timeline record found for run ${RUN_ID}." >&2
  echo "This either means nothing is actually waiting on approval right now, or the" >&2
  echo "record type name assumed by this script doesn't match what a real approval" >&2
  echo "check produces. See this script's header for the manual PATCH fallback." >&2
  echo "Run: ${RUN_URL}" >&2
  exit 1
fi

FAILED=0
for APPROVAL_ID in ${APPROVAL_IDS}; do
  echo "Checking approval ${APPROVAL_ID}..."
  APPROVAL_JSON=$(az devops invoke --org "${ORG}" \
    --area approval --resource approvals \
    --route-parameters project="${PROJECT}" \
    --query-parameters approvalIds="${APPROVAL_ID}" \
    --api-version 7.1 --http-method GET -o json)

  STATUS=$(echo "${APPROVAL_JSON}" | jq -r '.value[0].status // empty')
  if [ "${STATUS}" != "pending" ]; then
    echo "Approval ${APPROVAL_ID} is not pending (status: '${STATUS:-unknown}') — skipping."
    continue
  fi

  echo "Approving ${APPROVAL_ID}..."
  PATCH_BODY=$(jq -n --arg id "${APPROVAL_ID}" --arg comment "${COMMENT}" \
    '[{approvalId: $id, status: "approved", comment: $comment}]')
  PATCH_FILE=$(mktemp)
  echo "${PATCH_BODY}" > "${PATCH_FILE}"

  if ! az devops invoke --org "${ORG}" \
    --area approval --resource approvals \
    --route-parameters project="${PROJECT}" \
    --api-version 7.1 --http-method PATCH --in-file "${PATCH_FILE}" -o json; then
    echo "##[error] Failed to approve ${APPROVAL_ID}. Use the manual fallback in this script's header." >&2
    FAILED=1
  fi
  rm -f "${PATCH_FILE}"
done

echo "Run: ${RUN_URL}"

if [ "${FAILED}" != "0" ]; then
  exit 1
fi
