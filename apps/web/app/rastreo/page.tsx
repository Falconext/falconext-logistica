'use client';

import { MapboxFleetMap } from '../../components/tracking/MapboxFleetMap';
import { Navigation } from 'lucide-react';

export default function RastreoPage() {
  return (
    <div className="h-[calc(100dvh-170px)] sm:h-[calc(100vh-100px)] flex flex-col gap-3 sm:gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#1a1a1c] flex items-center justify-center text-[#FFC933] shrink-0">
          <Navigation size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rastreo en Vivo</h1>
          <p className="text-sm text-slate-500">Todos tus dispositivos rastreados en un solo mapa, en tiempo real.</p>
        </div>
      </div>
      <div className="flex-1 rounded-2xl border border-slate-200 overflow-hidden shadow-sm relative">
        <MapboxFleetMap />
      </div>
    </div>
  );
}
