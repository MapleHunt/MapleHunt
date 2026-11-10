begin;

delete from public.land_areas
 where source like 'Ontario GeoHub: Crown Land - Ministry Acquisitions%';

insert into public.land_areas (category, hunting_status, geom, source)
select 'crown',
       'check',
       st_multi(geom),
       'Ontario GeoHub: Crown Land - Ministry Acquisitions (Open Government Licence - Ontario)'
from staging.acq;

commit;

-- How much of this layer lands inside the demo unit
select count(*) as acq_areas,
       count(*) filter (where not st_isvalid(l.geom)) as invalid,
       count(*) filter (where st_intersects(l.geom, w.geom)) as touching_87d,
       round((coalesce(sum(st_area(st_intersection(l.geom, w.geom)::geography))
              filter (where st_intersects(l.geom, w.geom)), 0) / 1e4)::numeric, 1) as hectares_in_87d
from public.land_areas l
cross join (select geom from public.wmu_boundaries where wmu_code = '87D') w
where l.source like 'Ontario GeoHub: Crown Land - Ministry Acquisitions%';
