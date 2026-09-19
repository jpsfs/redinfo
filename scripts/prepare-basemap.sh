#!/usr/bin/env bash
# One-off: cut a Norte-Portugal-sized slice out of the Protomaps daily
# planet basemap build and land it as `data/basemap/portugal.pmtiles`, the
# file the `tiles` service (docker-compose.yml) serves at `/tiles/` (#247
# stage 4 — see `docs/plans/planeamento-transportes-redesign.md` §5).
# Documented here, rather than automated into `up`, for the same reason
# `scripts/prepare-osrm-data.sh` is: a data-preparation step, not
# application code.
#
# `pmtiles extract` streams the cut via HTTP range requests against the
# remote planet file — it never downloads the whole ~138 GB planet
# (https://docs.protomaps.com/pmtiles/cli#extract), so this is minutes and
# a few hundred MB, not hours and a disk. Idempotent: re-running skips
# extraction if the output already exists; delete
# `data/basemap/portugal.pmtiles` to force a redo (e.g. for a fresher build).
#
# Usage: scripts/prepare-basemap.sh
set -euo pipefail

# Official image (https://docs.protomaps.com/pmtiles/cli#installation) — a
# single static Go binary, no external dependencies.
PMTILES_IMAGE="protomaps/go-pmtiles"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data/basemap"
OUTPUT_FILE="portugal.pmtiles"

# The daily planet builds are dated, and Protomaps' own docs warn the URLs
# are not permanent — so the build to cut from is discovered rather than
# hardcoded. `builds.json` is the same listing maps.protomaps.com/builds
# renders, newest last. Override `PROTOMAPS_BUILD_URL` to pin a specific one.
BUILD_METADATA_URL="https://build-metadata.protomaps.dev/builds.json"
BUILD_BASE_URL="https://build.protomaps.com"

# Norte Portugal, generous margin — the delegation's working region plus
# Porto (an hour south of it, per the design doc's off-frame-destination
# case) and the Spanish border crossings a referral occasionally reaches.
# `min_lon,min_lat,max_lon,max_lat`. Override for a different service area.
BBOX="${BASEMAP_BBOX:--9.05,40.95,-7.85,42.15}"

# Street-level detail without the size of the full 0-15 pyramid a whole
# country doesn't need at this bbox size (#247 stage 4 draws routes and
# facility/stop pins, not a routing surface itself — that stays OSRM's job).
MAXZOOM="${BASEMAP_MAXZOOM:-14}"

mkdir -p "$DATA_DIR"

if [ -f "$DATA_DIR/$OUTPUT_FILE" ]; then
  echo "$OUTPUT_FILE already prepared — delete $DATA_DIR/$OUTPUT_FILE to redo. Nothing to do."
  exit 0
fi

if [ -z "${PROTOMAPS_BUILD_URL:-}" ]; then
  echo "Looking up the latest daily build..."
  LATEST_KEY="$(curl -fsSL "$BUILD_METADATA_URL" |
    grep -oE '"key"[[:space:]]*:[[:space:]]*"[0-9]+\.pmtiles"' |
    grep -oE '[0-9]+\.pmtiles' |
    sort |
    tail -1)"
  if [ -z "$LATEST_KEY" ]; then
    echo "Could not find a build in $BUILD_METADATA_URL." >&2
    echo "Pick one by hand at https://maps.protomaps.com/builds and re-run:" >&2
    echo "  PROTOMAPS_BUILD_URL=$BUILD_BASE_URL/<date>.pmtiles $0" >&2
    exit 1
  fi
  PROTOMAPS_BUILD_URL="$BUILD_BASE_URL/$LATEST_KEY"
fi

echo "Extracting bbox $BBOX (maxzoom $MAXZOOM) from $PROTOMAPS_BUILD_URL..."
docker run --rm -v "$DATA_DIR:/data" "$PMTILES_IMAGE" \
  extract "$PROTOMAPS_BUILD_URL" "/data/$OUTPUT_FILE" --bbox="$BBOX" --maxzoom="$MAXZOOM"

echo "Done. $DATA_DIR/$OUTPUT_FILE is ready for the tiles service."
