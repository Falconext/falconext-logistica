import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Auto-refresco "consciente del costo" para pantallas en vivo (Panel, Recorridos…).
 *
 * Solo consulta a la API mientras la app está en PRIMER PLANO (AppState 'active').
 * Cuando pasa a segundo plano deja de consultar → la base de datos (Neon) puede
 * suspenderse y baja el costo de compute. Al volver a primer plano dispara un
 * refresco inmediato para que el dato esté fresco justo cuando el usuario mira.
 *
 * Equivalente móvil del `useLivePolling` de la web: allá el guard es la visibilidad
 * de la pestaña (`document.hidden`); aquí es el estado de la app (`AppState`).
 */
export function useLivePolling(refresh: () => void, intervalMs: number) {
  // Guardamos la última función en un ref para no reiniciar el intervalo en cada render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState === 'active') refreshRef.current();
    }, intervalMs);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshRef.current();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs]);
}
