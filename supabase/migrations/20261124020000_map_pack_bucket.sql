-- Migration 0006: public Storage bucket for the offline map pack (T08).
-- Layout (written by pipeline/publish_pack.sh):
--   map-packs/<version>/pack.pmtiles
--   map-packs/<version>/pack.pmtiles.sha256
--   map-packs/manifest.json    -> { version, path, sha256, bytes, bbox, builtAt }
-- Anyone can read (the app downloads it before going offline); only the
-- service role can write, because there are no insert/update policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-packs', 'map-packs', true, 157286400,  -- 150 MB, same cap as build_tiles.sh
        array['application/vnd.pmtiles', 'application/octet-stream', 'application/json', 'text/plain'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
