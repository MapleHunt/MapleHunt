#!/usr/bin/env bash
# Publishes pipeline/data/pack/pack.pmtiles (from build_tiles.sh) to Supabase Storage.
# Usage: bash pipeline/publish_pack.sh [version, default v1]
# Needs in .env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never put that key in frontend/.env).
# Safe to re-run: every upload overwrites (x-upsert), and manifest.json is written last,
# so the app never sees a manifest that points at a half-uploaded pack.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-v1}"
PACK="pipeline/data/pack/pack.pmtiles"
BUCKET="map-packs"
BBOX="-80.373,43.13,-79.737,43.56"   # keep in sync with build_tiles.sh

env_val() { grep -E "^$1=" .env | cut -d= -f2- | tr -d "'\"" || true; }
URL="$(env_val SUPABASE_URL)"; KEY="$(env_val SUPABASE_SERVICE_ROLE_KEY)"
[ -n "$URL" ] || { echo "SUPABASE_URL is empty in .env"; exit 1; }
[ -n "$KEY" ] || { echo "SUPABASE_SERVICE_ROLE_KEY is empty in .env"; exit 1; }
[ -f "$PACK" ] || { echo "No $PACK; run pipeline/build_tiles.sh first"; exit 1; }

SHA="$(sha256sum "$PACK" | cut -d' ' -f1)"
BYTES="$(stat -c %s "$PACK")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "$SHA  pack.pmtiles" > "$TMP/pack.pmtiles.sha256"
cat > "$TMP/manifest.json" <<EOF
{
  "version": "$VERSION",
  "path": "$VERSION/pack.pmtiles",
  "sha256": "$SHA",
  "bytes": $BYTES,
  "bbox": [$BBOX],
  "builtAt": "$(date -u -r "$PACK" +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

upload() { # <local file> <object path> <content type> <cache-control seconds>
  echo "Uploading $2"
  curl -fsS -X POST "$URL/storage/v1/object/$BUCKET/$2" \
    -H "Authorization: Bearer $KEY" -H "apikey: $KEY" \
    -H "Content-Type: $3" -H "x-upsert: true" -H "Cache-Control: max-age=$4" \
    --data-binary "@$1" > /dev/null
}

upload "$PACK" "$VERSION/pack.pmtiles" application/vnd.pmtiles 31536000
upload "$TMP/pack.pmtiles.sha256" "$VERSION/pack.pmtiles.sha256" text/plain 31536000
upload "$TMP/manifest.json" manifest.json application/json 60

# Check the public copy matches what we built.
PUB="$URL/storage/v1/object/public/$BUCKET"
GOT="$(curl -fsS "$PUB/$VERSION/pack.pmtiles" | sha256sum | cut -d' ' -f1)"
[ "$GOT" = "$SHA" ] || { echo "Checksum mismatch after upload: $GOT"; exit 1; }
echo "Published $VERSION ($((BYTES / 1048576)) MB, sha256 $SHA)"
echo "Manifest: $PUB/manifest.json"
echo "Pack:     $PUB/$VERSION/pack.pmtiles"
