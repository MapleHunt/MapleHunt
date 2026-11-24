-- Tests for migration 20261124060000_mesh_node.sql (set_mesh_node, T15).
-- Needs at least 2 profiles in the project (3 for the non-member test).
begin;

create temp table _results (step int, outcome text) on commit drop;
grant insert, select on _results to anon, authenticated;

do $$
declare
  a uuid; b uuid; c uuid; pid uuid; v text;
begin
  select id into a from public.profiles order by created_at nulls last, id limit 1;
  select id into b from public.profiles where id <> a order by id limit 1;
  select id into c from public.profiles where id not in (a, b) order by id limit 1;
  if b is null then
    insert into _results values (0, 'SKIP need at least 2 profiles');
    return;
  end if;

  insert into public.parties (name, tag_holder_id, species, season_year)
  values ('mesh test party', a, 'deer', 2026) returning id into pid;
  insert into public.party_members (party_id, profile_id, role) values (pid, a, 'tag_holder'), (pid, b, 'member');

  -- act as A
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.set_mesh_node(pid, '!a1b2c3d4');
  select mesh_node_id into v from public.party_members where party_id = pid and profile_id = a;
  insert into _results values (1, case when v = '!a1b2c3d4' then 'PASS A records its radio' else 'FAIL A: ' || coalesce(v, 'null') end);

  begin
    perform public.set_mesh_node(pid, 'a1b2c3d4');
    insert into _results values (2, 'FAIL bad node id was accepted');
  exception when invalid_parameter_value then
    insert into _results values (2, 'PASS bad node id is rejected');
  end;

  -- act as B, claiming the same radio
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.set_mesh_node(pid, '!a1b2c3d4');
  select mesh_node_id into v from public.party_members where party_id = pid and profile_id = a;
  insert into _results values (3, case when v is null
    and (select mesh_node_id from public.party_members where party_id = pid and profile_id = b) = '!a1b2c3d4'
    then 'PASS radio handed over: B has it, A cleared' else 'FAIL handover, A still has: ' || coalesce(v, 'null') end);

  perform public.set_mesh_node(pid, null);
  select mesh_node_id into v from public.party_members where party_id = pid and profile_id = b;
  insert into _results values (4, case when v is null then 'PASS null clears B' else 'FAIL clear: ' || v end);

  -- B claims again, then a non-member C tries to take it
  perform public.set_mesh_node(pid, '!0000beef');
  if c is null then
    insert into _results values (5, 'SKIP non-member test needs a 3rd profile');
  else
    perform set_config('request.jwt.claim.sub', c::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    begin
      perform public.set_mesh_node(pid, '!0000beef');
      insert into _results values (5, 'FAIL non-member was accepted');
    exception when insufficient_privilege then
      select mesh_node_id into v from public.party_members where party_id = pid and profile_id = b;
      insert into _results values (5, case when v = '!0000beef'
        then 'PASS non-member rejected and B keeps its radio' else 'FAIL non-member changed B to: ' || coalesce(v, 'null') end);
    end;
  end if;

  -- not signed in
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.set_mesh_node(pid, '!a1b2c3d4');
    insert into _results values (6, 'FAIL signed-out call was accepted');
  exception when insufficient_privilege then
    insert into _results values (6, 'PASS signed-out call is rejected');
  end;
end;
$$;

-- 7: the anon role cannot call it at all
set local role anon;
do $$
begin
  perform public.set_mesh_node(gen_random_uuid(), null);
  insert into _results values (7, 'FAIL anon could call set_mesh_node');
exception when insufficient_privilege then
  insert into _results values (7, 'PASS anon cannot call set_mesh_node');
end;
$$;
reset role;

select step, outcome from _results order by step;

rollback;
