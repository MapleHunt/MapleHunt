-- =====================================================================
-- MapleHunt — initial schema (from Figure 3, ER diagram)
-- Postgres + PostGIS on Supabase. All geometry in WGS 84 (EPSG:4326).
-- PostGIS lives in the "extensions" schema, so spatial types are qualified.
-- =====================================================================

-- ---------- Enums ----------------------------------------------------
create type public.species_t   as enum ('deer', 'moose', 'bear');
create type public.sex_t       as enum ('male', 'female');
create type public.age_class_t as enum ('adult', 'yearling', 'young');
create type public.method_t    as enum ('gun', 'bow', 'muzzleloader');

-- GIS reference data (loaded by the pipeline, read-only for the app)

create table public.wmu_boundaries (
  wmu_code     text primary key,
  name         text,
  geom         extensions.geometry(MultiPolygon, 4326) not null,
  source       text,
  imported_at  timestamptz not null default now()
);
create index wmu_boundaries_geom_idx on public.wmu_boundaries using gist (geom);

create table public.land_areas (
  id              serial primary key,
  category        text not null check (category in ('crown', 'park', 'reserve', 'conservation', 'other')),
  name            text,
  hunting_status  text not null default 'check' check (hunting_status in ('open', 'closed', 'check')),
  geom            extensions.geometry(MultiPolygon, 4326) not null,
  source          text
);
create index land_areas_geom_idx on public.land_areas using gist (geom);

-- Users and parties

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  email         text,
  home_wmu      text references public.wmu_boundaries (wmu_code),
  created_at    timestamptz not null default now()
);

create table public.parties (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  tag_holder_id  uuid not null references public.profiles (id) on delete cascade,
  species        public.species_t not null,
  wmu_code       text references public.wmu_boundaries (wmu_code),
  mesh_channel   text,
  season_year    int not null,
  created_at     timestamptz not null default now()
);
create index parties_tag_holder_idx on public.parties (tag_holder_id);

create table public.party_members (
  party_id      uuid not null references public.parties (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  role          text not null default 'member' check (role in ('tag_holder', 'member')),
  mesh_node_id  text,
  joined_at     timestamptz not null default now(),
  primary key (party_id, profile_id)
);
create index party_members_profile_idx on public.party_members (profile_id);

-- Field records (created offline on the phone, synced later)
-- ids are generated on the phone so a retried sync never duplicates.
-- updated_at is set by the phone; the API keeps the newest version.

create table public.hunt_days (
  id          uuid primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  party_id    uuid references public.parties (id) on delete set null,
  wmu_code    text references public.wmu_boundaries (wmu_code),
  hunt_date   date not null,
  species     public.species_t not null,
  hours       numeric(4,1) check (hours >= 0 and hours <= 24),
  updated_at  timestamptz not null default now()
);
create index hunt_days_user_idx on public.hunt_days (user_id);

create table public.harvest_records (
  id            uuid primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  hunt_day_id   uuid references public.hunt_days (id) on delete set null,
  species       public.species_t not null,
  sex           public.sex_t not null,
  age_class     public.age_class_t not null,
  method        public.method_t not null,
  harvested_at  timestamptz not null,
  location      extensions.geography(Point, 4326),
  wmu_code      text references public.wmu_boundaries (wmu_code),
  tag_number    text,
  photo_path    text,
  updated_at    timestamptz not null default now()
);
create index harvest_records_user_idx     on public.harvest_records (user_id);
create index harvest_records_hunt_day_idx on public.harvest_records (hunt_day_id);
create index harvest_records_location_idx on public.harvest_records using gist (location);

create table public.observations (
  id           uuid primary key,
  hunt_day_id  uuid not null references public.hunt_days (id) on delete cascade,
  species      text not null,
  sex          text,
  age_class    text,
  count        int not null default 1 check (count > 0),
  location     extensions.geography(Point, 4326)
);
create index observations_hunt_day_idx on public.observations (hunt_day_id);
create index observations_location_idx on public.observations using gist (location);

-- Mesh / assistant

create table public.party_positions (
  id            bigserial primary key,
  party_id      uuid not null references public.parties (id) on delete cascade,
  mesh_node_id  text not null,
  location      extensions.geography(Point, 4326) not null,
  reported_at   timestamptz not null,
  via           text not null check (via in ('lora', 'internet'))
);
create index party_positions_party_time_idx on public.party_positions (party_id, reported_at desc);
create index party_positions_location_idx   on public.party_positions using gist (location);

create table public.reg_chunks (
  id           serial primary key,
  season_year  int not null,
  section      text,
  body         text not null,
  source_url   text,
  page         int,
  tsv          tsvector generated always as
                 (to_tsvector('english', coalesce(section, '') || ' ' || body)) stored
);
create index reg_chunks_tsv_idx on public.reg_chunks using gin (tsv);

create table public.assistant_queries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  question         text not null,
  answer           text,
  cited_chunk_ids  int[],
  created_at       timestamptz not null default now()
);
create index assistant_queries_user_idx on public.assistant_queries (user_id);

-- Create a profile automatically when someone signs up

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper functions for RLS (security definer avoids policy recursion)

create function public.is_party_member(p_party uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.party_members
    where party_id = p_party and profile_id = (select auth.uid())
  )
  or exists (
    select 1 from public.parties
    where id = p_party and tag_holder_id = (select auth.uid())
  );
$$;

create function public.shares_party_with(p_profile uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.party_members me
    join public.party_members them on them.party_id = me.party_id
    where me.profile_id = (select auth.uid()) and them.profile_id = p_profile
  );
$$;

-- Row Level Security

alter table public.wmu_boundaries    enable row level security;
alter table public.land_areas        enable row level security;
alter table public.profiles          enable row level security;
alter table public.parties           enable row level security;
alter table public.party_members     enable row level security;
alter table public.hunt_days         enable row level security;
alter table public.harvest_records   enable row level security;
alter table public.observations      enable row level security;
alter table public.party_positions   enable row level security;
alter table public.reg_chunks        enable row level security;
alter table public.assistant_queries enable row level security;

-- Reference data: anyone can read, nobody but the service role writes
create policy "read wmu"        on public.wmu_boundaries for select to anon, authenticated using (true);
create policy "read land areas" on public.land_areas     for select to anon, authenticated using (true);
create policy "read regs"       on public.reg_chunks     for select to anon, authenticated using (true);

-- Profiles: see yourself and your party-mates; edit only yourself
create policy "read own or party profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_party_with(id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Parties: members can read; only the tag holder creates/edits/deletes
create policy "read my parties" on public.parties for select to authenticated
  using (public.is_party_member(id));
create policy "create party as tag holder" on public.parties for insert to authenticated
  with check (tag_holder_id = (select auth.uid()));
create policy "tag holder edits party" on public.parties for update to authenticated
  using (tag_holder_id = (select auth.uid())) with check (tag_holder_id = (select auth.uid()));
create policy "tag holder deletes party" on public.parties for delete to authenticated
  using (tag_holder_id = (select auth.uid()));

-- Party members: see your party's roster; join or leave as yourself
create policy "read party roster" on public.party_members for select to authenticated
  using (public.is_party_member(party_id));
create policy "join party as self" on public.party_members for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy "update own membership" on public.party_members for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "leave party" on public.party_members for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Hunt days and harvests: strictly your own
create policy "own hunt days" on public.hunt_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own harvests" on public.harvest_records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Observations: owned through their hunt day
create policy "own observations" on public.observations for all to authenticated
  using (exists (select 1 from public.hunt_days d
                 where d.id = hunt_day_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from public.hunt_days d
                      where d.id = hunt_day_id and d.user_id = (select auth.uid())));

-- Party positions: party members read and report
create policy "read party positions" on public.party_positions for select to authenticated
  using (public.is_party_member(party_id));
create policy "report party position" on public.party_positions for insert to authenticated
  with check (public.is_party_member(party_id));

-- Assistant history: your own
create policy "own assistant queries" on public.assistant_queries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Grants ("Automatically expose new tables" is OFF, so grant explicitly)
-- RLS above still decides which ROWS each user can see.

grant usage on schema public to anon, authenticated, service_role;

grant select on public.wmu_boundaries, public.land_areas, public.reg_chunks
  to anon, authenticated;

grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.parties           to authenticated;
grant select, insert, update, delete on public.party_members     to authenticated;
grant select, insert, update, delete on public.hunt_days         to authenticated;
grant select, insert, update, delete on public.harvest_records   to authenticated;
grant select, insert, update, delete on public.observations      to authenticated;
grant select, insert                 on public.party_positions   to authenticated;
grant select, insert                 on public.assistant_queries to authenticated;
grant usage on sequence public.party_positions_id_seq to authenticated;

grant execute on function public.is_party_member(uuid)   to authenticated;
grant execute on function public.shares_party_with(uuid) to authenticated;

-- The backend API (service role) can do everything; it bypasses RLS

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;