import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Auto-refresco "consciente del costo" para pantallas en vivo (Panel, Recorridos,
 * Mi Ruta, Operaciones…).
 *
 * Solo consulta a la API mientras la app está en PRIMER PLANO (AppState 'active')
 * y el usuario estuvo activo hace poco. Cuando pasa a segundo plano deja de
 * consultar → la base de datos (Neon) puede suspenderse y baja el costo de
 * compute. Al volver a primer plano dispara un refresco inmediato para que el
 * dato esté fresco justo cuando el usuario mira.
 *
 * Guardia de inactividad: si nadie tocó la app en `idleMs` (default 15 min), el
 * polling se pausa aunque la app siga en pantalla — evita que un celular
 * olvidado en el asiento con la app abierta consulte toda la jornada. Cualquier
 * interacción (registrada con `markActivity()`) o volver a primer plano lo reanuda.
 *
 * Nota: desde que hay notificaciones push, esto es solo un RESPALDO (por si el
 * push no llega); por eso el intervalo puede ser laxo (60 s).
 *
 * Equivalente móvil del `useLivePolling` de la web: allá el guard es la visibilidad
 * de la pestaña (`document.hidden`); aquí es el estado de la app (`AppState`).
 */
const IDLE_DEFAULT_MS = 15 * 60 * 1000;

// Última interacción del usuario, compartida entre pantallas: tocar en cualquier
// lado cuenta como "activo" para todas.
let lastActivity = Date.now();
export function markActivity() {
  lastActivity = Date.now();
}

export function useLivePolling(refresh: () => void, intervalMs: number, idleMs: number = IDLE_DEFAULT_MS) {
  // Guardamos la última función en un ref para no reiniciar el intervalo en cada render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (Date.now() - lastActivity > idleMs) return; // inactivo: no gastar
      refreshRef.current();
    }, intervalMs);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        markActivity(); // volver a la app cuenta como interacción
        refreshRef.current();
      }
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs, idleMs]);
}
