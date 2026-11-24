-- Tests for migration 0005 (wmu_at, land_at, check_position).
begin;

create temp table _results (step int, outcome text) on commit drop;
grant insert, select on _results to anon, authenticated;

do $$
declare
  c_lon double precision;
  c_lat double precision;
  v text;
  j jsonb;
begin
  -- 1-3: known places (checked by hand on Nov 19)
  v := public.wmu_at(-79.8949, 43.3307);
  insert into _results values (1, case when v = '87D' then 'PASS Waterdown is 87D' else 'FAIL Waterdown: ' || coalesce(v, 'null') end);
  v := public.wmu_at(-79.8774, 43.5183);
  insert into _results values (2, case when v = '79D' then 'PASS Milton is 79D' else 'FAIL Milton: ' || coalesce(v, 'null') end);
  v := public.wmu_at(-80.2482, 43.5448);
  insert into _results values (3, case when v = '80' then 'PASS Guelph is 80' else 'FAIL Guelph: ' || coalesce(v, 'null') end);

  -- 4: outside Ontario
  v := public.wmu_at(-75.0, 40.0);
  insert into _results values (4, case when v is null then 'PASS outside Ontario is null' else 'FAIL outside Ontario: ' || v end);

  -- 5: a point inside a Crown parcel in 87D
  select extensions.st_x(p), extensions.st_y(p) into c_lon, c_lat
    from (select extensions.st_pointonsurface(l.geom) as p
            from public.land_areas l
           where l.category = 'crown' and l.hunting_status <> 'closed'
           order by l.id) s,
         public.wmu_boundaries w
   where w.wmu_code = '87D' and extensions.st_contains(w.geom, s.p)
   limit 1;
  if c_lon is null then
    insert into _results values (5, 'FAIL no Crown parcel found in 87D');
  else
    j := public.land_at(c_lon, c_lat);
    insert into _results values (5, case when j->>'status' = 'crown'
      then format('PASS Crown point (%s, %s) is crown, area id %s', round(c_lon::numeric, 5), round(c_lat::numeric, 5), j->'area'->>'id')
      else 'FAIL Crown point: ' || j::text end);
  end if;

  -- 6: Waterdown street, no land area
  j := public.land_at(-79.8949, 43.3307);
  insert into _results values (6, case when j->>'status' = 'check' and j->'area' = 'null'::jsonb
    then 'PASS Waterdown street says check access' else 'FAIL Waterdown land: ' || j::text end);

  -- 7: closed beats Crown (test row, rolled back)
  if c_lon is not null then
    insert into public.land_areas (category, hunting_status, geom, source)
    values ('other', 'closed',
            extensions.st_multi(extensions.st_buffer(
              extensions.st_setsrid(extensions.st_makepoint(c_lon, c_lat), 4326)::extensions.geography, 50)::extensions.geometry),
            'test row');
    j := public.land_at(c_lon, c_lat);
    insert into _results values (7, case when j->>'status' = 'closed' and j->>'message' = 'No hunting here'
      then 'PASS closed beats Crown' else 'FAIL closed vs Crown: ' || j::text end);
  end if;

  -- 8: bad input is rejected
  begin
    perform public.wmu_at(0, 95);
    insert into _results values (8, 'FAIL lat 95 was accepted');
  exception when invalid_parameter_value then
    insert into _results values (8, 'PASS lat 95 is rejected');
  end;

  -- 9: check_position returns both parts
  j := public.check_position(-79.8949, 43.3307);
  insert into _results values (9, case when j->>'wmuCode' = '87D' and j->'land'->>'status' = 'check'
    then 'PASS check_position' else 'FAIL check_position: ' || j::text end);
end;
$$;

-- 10-11: the app's roles can call them
set local role anon;
insert into _results
select 10, case when public.wmu_at(-79.8949, 43.3307) = '87D' then 'PASS anon can call wmu_at' else 'FAIL anon wmu_at' end;
reset role;

set local role authenticated;
insert into _results
select 11, case when public.check_position(-79.8949, 43.3307)->>'wmuCode' = '87D' then 'PASS authenticated can call check_position' else 'FAIL authenticated' end;
reset role;

select step, outcome from _results order by step;

rollback;
