// Encuadre robusto del mapa de flota, compartido por PanelLiveMap (Panel de
// Control) y MapboxFleetMap (Rastreo). Toda la operación es en Italia/Europa
// —nunca en Perú, donde está el equipo—, así que cualquier punto fuera de esa
// región (GPS sin fix aún, placeholder 0,0, dato corrupto) es descartado antes
// de dibujar y de calcular el encuadre: un solo punto así hacía que el mapa
// saltara a una vista del planeta entero en vez de mostrar la flota.
const EUROPE_BOUNDS = { south: 34, west: -12, north: 72, east: 45 };

export function isFleetCoord(lat: number, lng: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) return false; // "null island"
    return lat >= EUROPE_BOUNDS.south && lat <= EUROPE_BOUNDS.north && lng >= EUROPE_BOUNDS.west && lng <= EUROPE_BOUNDS.east;
}

// Vista de reposo: norte de Italia (Milán), donde opera casi toda la flota.
// Se usa mientras no hay ubicaciones válidas, en vez de dejar el mapa mostrando
// el mundo entero por defecto.
export const FLEET_HOME = { lat: 45.4642, lng: 9.19 };
export const FLEET_HOME_ZOOM = 6;

// Encuadra el mapa a los puntos de la flota, con techo de zoom para que un
// único vehículo (o varios muy juntos) no termine pegado a nivel calle.
export function fitFleetBounds(
    map: google.maps.Map,
    points: { lat: number; lng: number }[],
    opts?: { padding?: number; maxZoom?: number }
) {
    const valid = points.filter((p) => isFleetCoord(p.lat, p.lng));
    const maxZoom = opts?.maxZoom ?? 11;

    if (valid.length === 0) {
        map.setCenter(FLEET_HOME);
        map.setZoom(FLEET_HOME_ZOOM);
        return;
    }
    if (valid.length === 1) {
        map.panTo(valid[0]);
        map.setZoom(Math.min(maxZoom, 11));
        return;
    }

    const bounds = new google.maps.LatLngBounds();
    valid.forEach((p) => bounds.extend(p));
    // fitBounds es async: el zoom final se conoce recién en el próximo
    // 'bounds_changed'. Si el resultado se pasa del techo (p. ej. dos puntos
    // casi superpuestos), se recorta ahí.
    google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if ((map.getZoom() || 0) > maxZoom) map.setZoom(maxZoom);
    });
    map.fitBounds(bounds, opts?.padding ?? 60);
}
