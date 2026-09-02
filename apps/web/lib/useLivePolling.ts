'use client';

import { useEffect, useRef } from 'react';

interface Options {
  /** Cada cuánto refrescar mientras la pantalla está activa y visible (ms). */
  intervalMs: number;
  /** Tras cuánto tiempo SIN interacción del usuario se pausa el refresco (ms). Default 15 min. */
  idleMs?: number;
}

/**
 * Auto-refresco "consciente del costo" para pantallas en vivo (Panel, Recorridos…).
 *
 * Solo consulta a la API cuando la pestaña está VISIBLE **y** el usuario ha
 * interactuado en los últimos `idleMs`. Si la pestaña se oculta (minimizada, otra
 * pestaña, laptop cerrada) o el usuario deja de interactuar, el refresco se pausa
 * y la base de datos puede suspenderse → deja de generar costo.
 *
 * Reanuda al instante (dispara un refresco inmediato) cuando el usuario vuelve a la
 * pestaña o hace la primera interacción tras estar inactivo. Así el dato siempre
 * está fresco justo cuando alguien lo está mirando.
 *
 * NO cierra la sesión: solo pausa las consultas, sin fricción de re-login.
 */
export function useLivePolling(refresh: () => void, { intervalMs, idleMs = 15 * 60_000 }: Options) {
  // Guardamos la última función en un ref para no reiniciar el intervalo en cada render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let disposed = false;
    let lastActivity = Date.now();

    const isActive = () => !document.hidden && Date.now() - lastActivity < idleMs;
    const id = setInterval(() => {
      if (!disposed && isActive()) refreshRef.current();
    }, intervalMs);

    // Cualquier interacción marca actividad. Si veníamos de estar inactivos (pausados)
    // y la pestaña está visible, refrescamos de inmediato al "despertar".
    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity >= idleMs;
      lastActivity = Date.now();
      if (wasIdle && !document.hidden) refreshRef.current();
    };

    // Volver a la pestaña cuenta como actividad y dispara un refresco inmediato.
    const onVisibility = () => {
      if (!document.hidden) {
        lastActivity = Date.now();
        refreshRef.current();
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
    for (const ev of activityEvents) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      clearInterval(id);
      for (const ev of activityEvents) window.removeEventListener(ev, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, idleMs]);
}
