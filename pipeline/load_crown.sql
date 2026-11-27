begin;

delete from public.land_areas
 where source like 'Ontario GeoHub: Crown Land - Ministry Unpatented Land%';

-- Skip the Great Lakes and Lake Simcoe lakebeds (all 700+ km²; the largest land
-- parcel in our area is about 200 km²). None of our species are hunted on open water,
-- and keeping them made the app call open water "Crown land · Open".
insert into public.land_areas (category, hunting_status, geom, source)
select 'crown',
       'check',
       st_multi(geom),
       'Ontario GeoHub: Crown Land - Ministry Unpatented Land (Open Government Licence - Ontario)'
from staging.crown
where st_area(geom::geography) < 500e6;

commit;

select count(*) as crown_areas,
       count(*) filter (where not st_isvalid(geom)) as invalid,
       min(st_srid(geom)) as srid
from public.land_areas
where source like 'Ontario GeoHub: Crown Land - Ministry Unpatented Land%';