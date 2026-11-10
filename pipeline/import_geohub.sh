#!/usr/bin/env bash
# Usage (from the repo root): bash pipeline/import_geohub.sh wmu|crown|acq
# Needs GDAL, the shapefiles in pipeline/data/, and SUPABASE_DB_URL in .env.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env found in $(pwd)"; exit 1; }
SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' .env | cut -d= -f2- | tr -d "'\"")"
[ -n "$SUPABASE_DB_URL" ] || { echo "SUPABASE_DB_URL is empty in .env"; exit 1; }

case "${1:-}" in
  wmu)
    ogr2ogr -f PostgreSQL "PG:$SUPABASE_DB_URL" \
      pipeline/data/wmu/Wildlife_Management_Unit.shp \
      -nln staging.wmu -lco GEOMETRY_NAME=geom -lco PRECISION=NO -nlt PROMOTE_TO_MULTI \
      -select OFFICIAL_N -t_srs EPSG:4326 -makevalid -overwrite -progress
    echo "Next: run pipeline/load_wmu.sql in the Supabase SQL Editor."
    ;;
  crown)
    # -spat is west south east north (lon/lat); widen it if the demo WMU is outside.
    ogr2ogr -f PostgreSQL "PG:$SUPABASE_DB_URL" \
      "pipeline/data/crown/Crown_Land%3A_Ministry_Unpatented_Land.shp" \
      -nln staging.crown -lco GEOMETRY_NAME=geom -lco PRECISION=NO -nlt PROMOTE_TO_MULTI \
      -spat -81.56 42.12 -77.84 44.82 -spat_srs EPSG:4326 -t_srs EPSG:4326 \
      -makevalid -overwrite -progress
    echo "Next: run pipeline/load_crown.sql in the Supabase SQL Editor."
    ;;
  acq)
    # Crown land the ministry bought later (may include Hyde Tract); the
    # unpatented layer does not contain these.
    ogr2ogr -f PostgreSQL "PG:$SUPABASE_DB_URL" \
      "pipeline/data/acq/Crown_land%3A_ministry_acquisitions.shp" \
      -nln staging.acq -lco GEOMETRY_NAME=geom -lco PRECISION=NO -nlt PROMOTE_TO_MULTI \
      -spat -81.56 42.12 -77.84 44.82 -spat_srs EPSG:4326 -t_srs EPSG:4326 \
      -makevalid -overwrite -progress
    echo "Next: run pipeline/load_acq.sql in the Supabase SQL Editor."
    ;;
  *)
    echo "Usage: bash pipeline/import_geohub.sh wmu|crown|acq"; exit 1 ;;
esac
