#!/usr/bin/env bash
# Builds the offline map pack for WMU 87D + 10 km: pipeline/data/pack/pack.pmtiles
# Layers: Protomaps basemap + "wmu" and "land" overlays from the database.
# Usage: bash pipeline/build_tiles.sh [protomaps-build-date, e.g. 20261125]
#   No date: reuse the basemap already in pipeline/data/pack/ (only the overlays are rebuilt).
#   With a date: download a fresh basemap. Protomaps only keeps recent daily builds,
#   so pick a date listed at https://maps.protomaps.com/builds/
# Needs pmtiles, tippecanoe (with tile-join), GDAL, and SUPABASE_DB_URL in .env.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD="${1:-}"
BBOX="-80.373,43.13,-79.737,43.56"
OUT="pipeline/data/pack"
MAX_MB=150

DB="$(grep -E '^SUPABASE_DB_URL=' .env | cut -d= -f2- | tr -d "'\"")"
[ -n "$DB" ] || { echo "SUPABASE_DB_URL is empty in .env"; exit 1; }
mkdir -p "$OUT"

if [ -n "$BUILD" ]; then
  echo "1/4 Basemap (Protomaps build $BUILD)"
  pmtiles extract "https://build.protomaps.com/$BUILD.pmtiles" "$OUT/basemap.pmtiles" \
    --bbox="$BBOX" --maxzoom=15
elif [ -f "$OUT/basemap.pmtiles" ]; then
  echo "1/4 Basemap: reusing $OUT/basemap.pmtiles (pass a build date to download a new one)"
else
  echo "No basemap yet. Run again with a Protomaps build date from https://maps.protomaps.com/builds/"
  exit 1
fi

echo "2/4 Overlays from the database"
BOX="extensions.ST_MakeEnvelope($BBOX,4326)"
ogr2ogr -f GeoJSON "$OUT/wmu.geojson" "PG:$DB" \
  -sql "select wmu_code as \"wmuCode\", geom from public.wmu_boundaries where st_intersects(geom, $BOX)"
ogr2ogr -f GeoJSON "$OUT/land.geojson" "PG:$DB" \
  -sql "select category, hunting_status as \"huntingStatus\", geom from public.land_areas where st_intersects(geom, $BOX)"

echo "3/4 Overlay tiles"
tippecanoe -o "$OUT/overlays.pmtiles" --force -Z5 -z15 --drop-densest-as-needed \
  --clip-bounding-box="$BBOX" \
  -L "wmu:$OUT/wmu.geojson" -L "land:$OUT/land.geojson"

echo "4/4 Merge"
tile-join -o "$OUT/pack.pmtiles" --force --no-tile-size-limit \
  "$OUT/basemap.pmtiles" "$OUT/overlays.pmtiles"

SIZE_MB=$(( $(stat -c %s "$OUT/pack.pmtiles") / 1048576 ))
echo "pack.pmtiles: ${SIZE_MB} MB (limit ${MAX_MB} MB)"
[ "$SIZE_MB" -le "$MAX_MB" ] || { echo "Pack is over the size limit"; exit 1; }
sha256sum "$OUT/pack.pmtiles"
