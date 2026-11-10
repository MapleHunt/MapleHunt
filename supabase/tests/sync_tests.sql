-- MapleHunt — security and sync tests for migration 0002
-- Run in the Supabase SQL Editor (or psql) AFTER the migration is applied.
-- Everything runs in one transaction that is rolled back at the end, so nothing is left behind.
-- Success: 14 "PASS" notices, then "ALL 14 TESTS PASSED".
-- Failure: the run stops with "FAIL <n>: <what went wrong>".

begin;

do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';   -- hunter A
  b uuid := '00000000-0000-4000-8000-00000000000b';   -- hunter B
  party uuid := '00000000-0000-4000-8000-0000000000aa';
  day_a uuid := '00000000-0000-4000-8000-0000000000d1';
  day_b uuid := '00000000-0000-4000-8000-0000000000d2';
  h1 uuid := '00000000-0000-4000-8000-0000000000e1';
  obs uuid := '00000000-0000-4000-8000-0000000000f1';
  t0 timestamptz := '2026-11-08 07:00:00+00';
  res jsonb;
  n int;
  failed boolean;
  cursor_ts timestamptz;

begin
  insert into auth.users (id, email) values (a, 'a@test.local'), (b, 'b@test.local');
  insert into public.parties (id, name, tag_holder_id, species, season_year)
       values (party, 'Test Camp', a, 'deer', 2026);
  insert into public.party_members (party_id, profile_id, role) values (party, a, 'tag_holder');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);

  res := public.sync_push(jsonb_build_object(
    'hunt_days', jsonb_build_array(jsonb_build_object('id', day_a, 'party_id', party, 'hunt_date', '2026-11-08',
                                                      'species', 'deer', 'hours', 6, 'updated_at', t0)),
    'harvest_records', jsonb_build_array(jsonb_build_object('id', h1, 'hunt_day_id', day_a, 'species', 'deer',
                     'sex', 'male', 'age_class', 'adult', 'method', 'gun', 'harvested_at', t0,
                     'location', 'SRID=4326;POINT(-78.1 45.3)', 'tag_number', 'TEST-1', 'updated_at', t0)),
    'observations', jsonb_build_array(jsonb_build_object('id', obs, 'hunt_day_id', day_a, 'species', 'deer',
                     'count', 3, 'updated_at', t0))));
  if jsonb_array_length(res->'applied'->'harvest_records') <> 1
     or jsonb_array_length(res->'applied'->'hunt_days') <> 1
     or jsonb_array_length(res->'applied'->'observations') <> 1 then
    raise exception 'FAIL 1: first push did not apply all three records: %', res;
  end if;
  raise notice 'PASS 1: first push saves hunt day, harvest and observation';

  perform public.sync_push(jsonb_build_object(
    'harvest_records', jsonb_build_array(jsonb_build_object('id', h1, 'hunt_day_id', day_a, 'species', 'deer',
                     'sex', 'male', 'age_class', 'adult', 'method', 'gun', 'harvested_at', t0, 'updated_at', t0))));
  select count(*) into n from public.harvest_records where id = h1;
  if n <> 1 then raise exception 'FAIL 2: retry created % rows', n; end if;
  raise notice 'PASS 2: retrying a push does not create duplicates';

  res := public.sync_push(jsonb_build_object(
    'harvest_records', jsonb_build_array(jsonb_build_object('id', h1, 'hunt_day_id', day_a, 'species', 'deer',
                     'sex', 'female', 'age_class', 'adult', 'method', 'gun', 'harvested_at', t0,
                     'updated_at', t0 - interval '1 hour'))));
  if jsonb_array_length(res->'applied'->'harvest_records') <> 0
     or (select sex from public.harvest_records where id = h1) <> 'male' then
    raise exception 'FAIL 3: older edit overwrote the newer one';
  end if;
  raise notice 'PASS 3: an older edit is ignored (newest wins)';

  res := public.sync_push(jsonb_build_object(
    'harvest_records', jsonb_build_array(jsonb_build_object('id', h1, 'hunt_day_id', day_a, 'species', 'deer',
                     'sex', 'male', 'age_class', 'yearling', 'method', 'gun', 'harvested_at', t0,
                     'location', 'SRID=4326;POINT(-78.1 45.3)', 'updated_at', t0 + interval '1 hour'))));
  if (select age_class from public.harvest_records where id = h1) <> 'yearling' then
    raise exception 'FAIL 4: newer edit was not applied';
  end if;
  raise notice 'PASS 4: a newer edit is applied';

  if (select server_updated_at from public.harvest_records where id = h1) < now() - interval '1 minute' then
    raise exception 'FAIL 5: server_updated_at was not set by the server';
  end if;
  raise notice 'PASS 5: server_updated_at is set by the server';

  res := public.sync_pull(null);
  if jsonb_array_length(res->'harvest_records') <> 1 or jsonb_array_length(res->'hunt_days') <> 1
     or jsonb_array_length(res->'observations') <> 1
     or (res->'harvest_records'->0->>'location') is null then
    raise exception 'FAIL 6: pull did not return A''s rows: %', res;
  end if;
  raise notice 'PASS 6: pull returns your own records, with location';

  cursor_ts := now() - interval '1 second';
  perform public.sync_push(jsonb_build_object(
    'harvest_records', jsonb_build_array(jsonb_build_object('id', h1, 'hunt_day_id', day_a, 'species', 'deer',
                     'sex', 'male', 'age_class', 'yearling', 'method', 'gun', 'harvested_at', t0,
                     'updated_at', t0 + interval '2 hours', 'deleted_at', t0 + interval '2 hours'))));
  res := public.sync_pull(cursor_ts);
  if (res->'harvest_records'->0->>'deleted_at') is null then
    raise exception 'FAIL 7: soft delete did not sync: %', res;
  end if;
  raise notice 'PASS 7: a delete made offline syncs as a soft delete';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);

  select count(*) into n from public.harvest_records;
  res := public.sync_pull(null);
  if n <> 0 or jsonb_array_length(res->'harvest_records') <> 0 then
    raise exception 'FAIL 8: B can see A''s harvests';
  end if;
  raise notice 'PASS 8: other users cannot see your harvests';

  perform public.sync_push(jsonb_build_object(
    'hunt_days', jsonb_build_array(jsonb_build_object('id', day_b, 'user_id', a, 'hunt_date', '2026-11-08',
                                                      'species', 'deer', 'updated_at', t0))));
  if (select user_id from public.hunt_days where id = day_b) <> b then
    raise exception 'FAIL 9: B created a row owned by A';
  end if;
  raise notice 'PASS 9: a spoofed user_id is ignored';

  failed := false;
  begin
    perform public.sync_push(jsonb_build_object(
      'harvest_records', jsonb_build_array(jsonb_build_object('id', h1, 'species', 'deer', 'sex', 'female',
                       'age_class', 'adult', 'method', 'bow', 'harvested_at', t0,
                       'updated_at', t0 + interval '5 hours'))));
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FAIL 10: B overwrote A''s harvest'; end if;
  raise notice 'PASS 10: you cannot overwrite another user''s record';

  failed := false;
  begin
    perform public.sync_push(jsonb_build_object(
      'harvest_records', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'hunt_day_id', day_a,
                       'species', 'deer', 'sex', 'male', 'age_class', 'adult', 'method', 'gun',
                       'harvested_at', t0, 'updated_at', t0))));
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FAIL 11: B linked a harvest to A''s hunt day'; end if;
  raise notice 'PASS 11: you cannot link records to another user''s hunt day';

  failed := false;
  begin
    perform public.sync_push(jsonb_build_object(
      'hunt_days', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'party_id', party,
                   'hunt_date', '2026-11-09', 'species', 'deer', 'updated_at', t0))));
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FAIL 12: B logged a hunt day in a party B is not in'; end if;
  insert into public.party_members (party_id, profile_id) values (party, b);
  res := public.sync_push(jsonb_build_object(
    'hunt_days', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'party_id', party,
                 'hunt_date', '2026-11-09', 'species', 'deer', 'updated_at', t0))));
  if jsonb_array_length(res->'applied'->'hunt_days') <> 1 then
    raise exception 'FAIL 12: B could not log a hunt day after joining the party';
  end if;
  raise notice 'PASS 12: party hunt days only for party members';

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);

  failed := false;
  begin
    perform public.sync_push('{}'::jsonb);
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FAIL 13: signed-out user could call sync_push'; end if;
  raise notice 'PASS 13: signed-out users cannot sync';

  failed := false;
  begin
    select count(*) into n from public.harvest_records;
  exception when others then failed := true;
  end;
  if not failed and n > 0 then raise exception 'FAIL 14: signed-out user can read harvests'; end if;
  raise notice 'PASS 14: signed-out users cannot read records';

  raise notice 'ALL 14 TESTS PASSED';
end;
$$;

rollback;
