-- Migration 0005: point lookups for the land check (T08).
--   wmu_at(lon, lat)         -> WMU code the point is in, or null
--   land_at(lon, lat)        -> the land advice, same rule as landAdvice() in packages/geo:
--                               closed beats Crown, Crown shows as open, anything else says "check access"
--   check_position(lon, lat) -> both in one call: { "wmuCode": ..., "land": {...} }
-- Points on an edge count as inside, like Turf in packages/geo.

create function public.wmu_at(lon double precision, lat double precision)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  code text;
begin
  if lon is null or lat is null or lon not between -180 and 180 or lat not between -90 and 90 then
    raise exception 'invalid point (%, %)', lon, lat using errcode = '22023';
  end if;

  select w.wmu_code into code
    from public.wmu_boundaries w
   where extensions.st_intersects(w.geom, extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326))
   order by w.wmu_code
   limit 1;

  return code;
end;
$$;

create function public.land_at(lon double precision, lat double precision)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  hit record;
  status text;
begin
  if lon is null or lat is null or lon not between -180 and 180 or lat not between -90 and 90 then
    raise exception 'invalid point (%, %)', lon, lat using errcode = '22023';
  end if;

  select l.id, l.name, l.category, l.hunting_status into hit
    from public.land_areas l
   where extensions.st_intersects(l.geom, extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326))
   order by (l.hunting_status = 'closed') desc, (l.category = 'crown') desc, l.id
   limit 1;

  if not found then
    return jsonb_build_object('status', 'check', 'message', 'Check access', 'area', null);
  end if;

  status := case
              when hit.hunting_status = 'closed' then 'closed'
              when hit.category = 'crown' then 'crown'
              else 'check'
            end;

  return jsonb_build_object(
    'status', status,
    'message', case status
                 when 'closed' then 'No hunting here'
                 when 'crown' then 'Crown land · Open — check WMU seasons'
                 else 'Check access'
               end,
    'area', jsonb_build_object('id', hit.id, 'name', hit.name, 'category', hit.category));
end;
$$;

create function public.check_position(lon double precision, lat double precision)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('wmuCode', public.wmu_at(lon, lat), 'land', public.land_at(lon, lat));
$$;

revoke all on function public.wmu_at(double precision, double precision) from public;
revoke all on function public.land_at(double precision, double precision) from public;
revoke all on function public.check_position(double precision, double precision) from public;

grant execute on function public.wmu_at(double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.land_at(double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.check_position(double precision, double precision) to anon, authenticated, service_role;
