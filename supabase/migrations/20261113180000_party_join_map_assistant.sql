-- MapleHunt — migration 0003: party join codes, map overlay, regulations search
--
-- 1. Parties get a short join code. Joining now goes through join_party(code):
--    the old policy let anyone who knew a party's id insert themselves, even
--    as 'tag_holder', and update their own role.
-- 2. create_party() makes the party and the tag holder's membership in one call.
-- 3. map_overlay() returns simplified WMU + land polygons around a point, so the
--    phone can draw them and run the land check offline (@maplehunt/geo).
-- 4. search_regs() is the full-text search the assistant Edge Function uses.

-- ---------- 1. Join codes ------------------------------------------------

create function public.new_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 6 characters without look-alikes (no 0/O, 1/I/L)
  select 'MH-' || string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (floor(random() * 31) + 1)::int, 1), '')
    from generate_series(1, 6);
$$;

alter table public.parties add column join_code text;
update public.parties set join_code = public.new_join_code() where join_code is null;
alter table public.parties
  alter column join_code set not null,
  alter column join_code set default public.new_join_code(),
  add constraint parties_join_code_key unique (join_code);

drop policy "join party as self" on public.party_members;
drop policy "update own membership" on public.party_members;
revoke update on public.party_members from authenticated;

-- Only the tag holder can add a row directly, and only for themselves (create_party does this).
create policy "tag holder adds self" on public.party_members for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and role = 'tag_holder'
    and exists (select 1 from public.parties p where p.id = party_id and p.tag_holder_id = (select auth.uid()))
  );

-- The tag holder can remove members (members can already leave on their own).
create policy "tag holder removes members" on public.party_members for delete to authenticated
  using (exists (select 1 from public.parties p where p.id = party_id and p.tag_holder_id = (select auth.uid())));

create function public.create_party(p_name text, p_species public.species_t, p_season_year int, p_wmu_code text default null)
returns public.parties
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  created public.parties;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'party name is required' using errcode = '22023';
  end if;

  insert into public.parties (name, tag_holder_id, species, season_year, wmu_code)
  values (trim(p_name), uid, p_species, p_season_year, p_wmu_code)
  returning * into created;

  insert into public.party_members (party_id, profile_id, role) values (created.id, uid, 'tag_holder');
  return created;
end;
$$;

-- Security definer: the caller is not a member yet, so RLS would hide the party.
create function public.join_party(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select id into pid from public.parties where join_code = upper(trim(p_code));
  if pid is null then
    raise exception 'No party with that join code' using errcode = 'P0002';
  end if;

  insert into public.party_members (party_id, profile_id, role)
  values (pid, uid, 'member')
  on conflict (party_id, profile_id) do nothing;
  return pid;
end;
$$;

-- Tag holder can make a fresh code (e.g. after a code was shared too widely).
create function public.rotate_join_code(p_party uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  code text;
begin
  update public.parties set join_code = public.new_join_code()
   where id = p_party and tag_holder_id = (select auth.uid())
   returning join_code into code;
  if code is null then
    raise exception 'only the tag holder can change the join code' using errcode = '42501';
  end if;
  return code;
end;
$$;

-- ---------- 3. Map overlay ----------------------------------------------

create function public.map_overlay(lon double precision, lat double precision, radius_km double precision default 15)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with area as (
    select extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography,
                                least(radius_km, 50) * 1000)::extensions.geometry as geom
  )
  select jsonb_build_object(
    'center', jsonb_build_array(lon, lat),
    'radius_km', least(radius_km, 50),
    'wmu', jsonb_build_object('type', 'FeatureCollection', 'features', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', 'Feature',
               'properties', jsonb_build_object('wmuCode', w.wmu_code, 'name', w.name),
               'geometry', extensions.st_asgeojson(extensions.st_simplifypreservetopology(w.geom, 0.0003), 6)::jsonb))
        from public.wmu_boundaries w, area
       where extensions.st_intersects(w.geom, area.geom)), '[]'::jsonb)),
    'land', jsonb_build_object('type', 'FeatureCollection', 'features', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', 'Feature',
               'properties', jsonb_build_object('id', l.id, 'category', l.category, 'name', l.name,
                                                'huntingStatus', l.hunting_status),
               'geometry', extensions.st_asgeojson(extensions.st_simplifypreservetopology(l.geom, 0.0001), 6)::jsonb))
        from public.land_areas l, area
       where extensions.st_intersects(l.geom, area.geom)), '[]'::jsonb))
  );
$$;

-- ---------- 4. Regulations search ---------------------------------------

create function public.search_regs(q text, max_results int default 6)
returns table (id int, season_year int, section text, body text, page int, source_url text, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.season_year, r.section, r.body, r.page, r.source_url,
         ts_rank(r.tsv, websearch_to_tsquery('english', q)) as rank
    from public.reg_chunks r
   where r.tsv @@ websearch_to_tsquery('english', q)
   order by rank desc
   limit least(max_results, 12);
$$;

-- ---------- Grants -------------------------------------------------------

revoke all on function public.new_join_code() from public, anon;
revoke all on function public.create_party(text, public.species_t, int, text) from public, anon;
revoke all on function public.join_party(text) from public, anon;
revoke all on function public.rotate_join_code(uuid) from public, anon;
revoke all on function public.map_overlay(double precision, double precision, double precision) from public, anon;
revoke all on function public.search_regs(text, int) from public, anon;

grant execute on function public.new_join_code() to authenticated;
grant execute on function public.create_party(text, public.species_t, int, text) to authenticated;
grant execute on function public.join_party(text) to authenticated;
grant execute on function public.rotate_join_code(uuid) to authenticated;
grant execute on function public.map_overlay(double precision, double precision, double precision) to authenticated;
grant execute on function public.search_regs(text, int) to authenticated, service_role;
