-- MapleHunt — migration 0002: offline sync

alter table public.hunt_days
  add column server_updated_at timestamptz not null default now(),
  add column deleted_at        timestamptz;

alter table public.harvest_records
  add column server_updated_at timestamptz not null default now(),
  add column deleted_at        timestamptz;

alter table public.observations
  add column user_id           uuid references public.profiles (id) on delete cascade,
  add column updated_at        timestamptz not null default now(),
  add column server_updated_at timestamptz not null default now(),
  add column deleted_at        timestamptz;

update public.observations o
   set user_id = d.user_id
  from public.hunt_days d
 where d.id = o.hunt_day_id and o.user_id is null;
alter table public.observations alter column user_id set not null;

-- Always overwrites whatever the client sent, so the pull cursor can be trusted.
create function public.touch_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

create trigger hunt_days_touch       before insert or update on public.hunt_days
  for each row execute function public.touch_server_updated_at();
create trigger harvest_records_touch before insert or update on public.harvest_records
  for each row execute function public.touch_server_updated_at();
create trigger observations_touch    before insert or update on public.observations
  for each row execute function public.touch_server_updated_at();

create index hunt_days_user_sync_idx       on public.hunt_days       (user_id, server_updated_at);
create index harvest_records_user_sync_idx on public.harvest_records (user_id, server_updated_at);
create index observations_user_sync_idx    on public.observations    (user_id, server_updated_at);

drop policy "own hunt days" on public.hunt_days;
create policy "own hunt days" on public.hunt_days for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (party_id is null or public.is_party_member(party_id))
  );

drop policy "own harvests" on public.harvest_records;
create policy "own harvests" on public.harvest_records for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (hunt_day_id is null or exists (
      select 1 from public.hunt_days d
       where d.id = hunt_day_id and d.user_id = (select auth.uid())))
  );

drop policy "own observations" on public.observations;
create policy "own observations" on public.observations for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.hunt_days d
       where d.id = hunt_day_id and d.user_id = (select auth.uid()))
  );

-- Body: {"hunt_days": [...], "harvest_records": [...], "observations": [...]}
-- (a field left out is saved as empty, so always send every field).
-- * user_id is always the signed-in user; whatever the client sent is ignored
-- * an existing row is only replaced if the incoming updated_at is newer
-- * location is sent as text: "SRID=4326;POINT(lon lat)"
-- Returns the ids that were applied. An id that was sent but is not returned
-- means the server already had a newer edit: the phone should pull.
create function public.sync_push(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  days_applied uuid[];
  harvests_applied uuid[];
  obs_applied uuid[];
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  with incoming as (
    select * from jsonb_populate_recordset(null::public.hunt_days, coalesce(payload -> 'hunt_days', '[]'))
  ), up as (
    insert into public.hunt_days as t (id, user_id, party_id, wmu_code, hunt_date, species, hours, updated_at, deleted_at)
    select id, uid, party_id, wmu_code, hunt_date, species, hours, coalesce(updated_at, now()), deleted_at from incoming
    on conflict (id) do update set
      party_id = excluded.party_id, wmu_code = excluded.wmu_code, hunt_date = excluded.hunt_date,
      species = excluded.species, hours = excluded.hours,
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
    where t.updated_at < excluded.updated_at
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into days_applied from up;

  with incoming as (
    select * from jsonb_populate_recordset(null::public.harvest_records, coalesce(payload -> 'harvest_records', '[]'))
  ), up as (
    insert into public.harvest_records as t (id, user_id, hunt_day_id, species, sex, age_class, method,
                                             harvested_at, location, wmu_code, tag_number, photo_path, updated_at, deleted_at)
    select id, uid, hunt_day_id, species, sex, age_class, method,
           harvested_at, location, wmu_code, tag_number, photo_path, coalesce(updated_at, now()), deleted_at from incoming
    on conflict (id) do update set
      hunt_day_id = excluded.hunt_day_id, species = excluded.species, sex = excluded.sex,
      age_class = excluded.age_class, method = excluded.method, harvested_at = excluded.harvested_at,
      location = excluded.location, wmu_code = excluded.wmu_code, tag_number = excluded.tag_number,
      photo_path = excluded.photo_path, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
    where t.updated_at < excluded.updated_at
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into harvests_applied from up;

  with incoming as (
    select * from jsonb_populate_recordset(null::public.observations, coalesce(payload -> 'observations', '[]'))
  ), up as (
    insert into public.observations as t (id, user_id, hunt_day_id, species, sex, age_class, count, location, updated_at, deleted_at)
    select id, uid, hunt_day_id, species, sex, age_class, count, location, coalesce(updated_at, now()), deleted_at from incoming
    on conflict (id) do update set
      hunt_day_id = excluded.hunt_day_id, species = excluded.species, sex = excluded.sex,
      age_class = excluded.age_class, count = excluded.count, location = excluded.location,
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
    where t.updated_at < excluded.updated_at
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into obs_applied from up;

  return jsonb_build_object(
    'applied', jsonb_build_object(
      'hunt_days', to_jsonb(days_applied),
      'harvest_records', to_jsonb(harvests_applied),
      'observations', to_jsonb(obs_applied)),
    'server_time', now());
end;
$$;

-- next_since overlaps by 30 seconds so a slow concurrent write is never missed;
-- the phone merges by id, so seeing a row twice is harmless.
create function public.sync_pull(since timestamptz default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cutoff timestamptz := coalesce(since, '-infinity'::timestamptz);
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'hunt_days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.server_updated_at)
        from public.hunt_days d
       where d.user_id = uid and d.server_updated_at > cutoff), '[]'),
    'harvest_records', coalesce((
      select jsonb_agg(to_jsonb(h) || jsonb_build_object('location',
               case when h.location is null then null
                    else 'SRID=4326;' || extensions.st_astext(h.location) end)
             order by h.server_updated_at)
        from public.harvest_records h
       where h.user_id = uid and h.server_updated_at > cutoff), '[]'),
    'observations', coalesce((
      select jsonb_agg(to_jsonb(o) || jsonb_build_object('location',
               case when o.location is null then null
                    else 'SRID=4326;' || extensions.st_astext(o.location) end)
             order by o.server_updated_at)
        from public.observations o
       where o.user_id = uid and o.server_updated_at > cutoff), '[]'),
    'next_since', now() - interval '30 seconds');
end;
$$;

revoke all on function public.sync_push(jsonb)         from public, anon;
revoke all on function public.sync_pull(timestamptz)   from public, anon;
revoke all on function public.touch_server_updated_at() from public, anon, authenticated;
grant execute on function public.sync_push(jsonb)       to authenticated, service_role;
grant execute on function public.sync_pull(timestamptz) to authenticated, service_role;
