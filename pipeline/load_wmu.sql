insert into public.wmu_boundaries (wmu_code, name, geom, source)
select official_n,
       'WMU ' || official_n,
       st_multi(st_union(geom)),
       'Ontario GeoHub: Wildlife Management Unit (Open Government Licence - Ontario)'
from staging.wmu
group by official_n
on conflict (wmu_code) do update
  set geom = excluded.geom,
      source = excluded.source,
      imported_at = now();

select count(*) as wmus,
       count(*) filter (where not st_isvalid(geom)) as invalid,
       min(st_srid(geom)) as srid
from public.wmu_boundaries;
