import { MapView } from "../map/MapView";
import type { MapSource } from "../map/mapPack";

const devMapSource: MapSource = { url: import.meta.env.VITE_MAP_PACK_URL || "/sample.pmtiles" };

interface MapScreenProps {
  source?: MapSource;
}

export function MapScreen({ source = devMapSource }: MapScreenProps) {
  return (
    <section className="map-screen">
      <h1 className="visually-hidden">Map</h1>
      <MapView source={source} />
    </section>
  );
}
