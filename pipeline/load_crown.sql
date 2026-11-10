begin;

delete from public.land_areas
 where source like 'Ontario GeoHub: Crown Land - Ministry Unpatented Land%';

insert into public.land_areas (category, hunting_status, geom, source)
select 'crown',
       'check',
       st_multi(geom),
       'Ontario GeoHub: Crown Land - Ministry Unpatented Land (Open Government Licence - Ontario)'
from staging.crown;

commit;

select count(*) as crown_areas,
       count(*) filter (where not st_isvalid(geom)) as invalid,
       min(st_srid(geom)) as srid
from public.land_areas
where source like 'Ontario GeoHub: Crown Land - Ministry Unpatented Land%';
