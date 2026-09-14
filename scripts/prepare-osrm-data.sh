#!/usr/bin/env bash
# One-off: download the Portugal OSM extract and pre-process it into the
# `.osrm*` files `osrm-routed` serves (see the `osrm` service in
# docker-compose.yml). Documented here, rather than automated into `up`,
# because it's a data-preparation step, not application code — the same
# reasoning behind `scripts/fetch-pt-localities.mjs`.
#
# Idempotent: re-running skips the download if the .pbf is already there, and
# skips extract/partition/customize entirely if the processed `.osrm` file
# already exists. Delete `data/routing/osrm/` to force a full redo (e.g. to
# pick up a fresher extract).
#
# Usage: scripts/prepare-osrm-data.sh
set -euo pipefail

OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v5.27.1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data/routing/osrm"
PBF_FILE="portugal-latest.osm.pbf"
OSRM_FILE="portugal-latest.osrm"

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/$PBF_FILE" ]; then
  echo "Downloading $PBF_FILE from Geofabrik..."
  curl -fL --retry 3 -o "$DATA_DIR/$PBF_FILE.part" "https://download.geofabrik.de/europe/$PBF_FILE"
  mv "$DATA_DIR/$PBF_FILE.part" "$DATA_DIR/$PBF_FILE"
else
  echo "$PBF_FILE already downloaded — skipping."
fi

if [ -f "$DATA_DIR/$OSRM_FILE" ]; then
  echo "$OSRM_FILE already prepared — delete $DATA_DIR to redo. Nothing to do."
  exit 0
fi

# MLD (multi-level Dijkstra), the currently-recommended OSRM algorithm — see
# the banner comment on OsrmRoutingService for why OSRM/MLD over Valhalla/CH.
echo "Extracting (car profile)..."
docker run --rm -v "$DATA_DIR:/data" "$OSRM_IMAGE" osrm-extract -p /opt/car.lua "/data/$PBF_FILE"

echo "Partitioning..."
docker run --rm -v "$DATA_DIR:/data" "$OSRM_IMAGE" osrm-partition "/data/$OSRM_FILE"

echo "Customizing..."
docker run --rm -v "$DATA_DIR:/data" "$OSRM_IMAGE" osrm-customize "/data/$OSRM_FILE"

echo "Done. $DATA_DIR/$OSRM_FILE is ready for the osrm service."
