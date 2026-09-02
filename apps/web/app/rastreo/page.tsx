'use client';

import { MapboxFleetMap } from '../../components/tracking/MapboxFleetMap';
import { Navigation } from 'lucide-react';
import { useT } from '../../lib/i18n';

export default function RastreoPage() {
  const t = useT();
  return (
    <div className="h-[calc(100dvh-170px)] sm:h-[calc(100vh-100px)] flex flex-col gap-3 sm:gap-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFCC00] to-[#F5A800] flex items-center justify-center text-[#3a2c00] shrink-0 shadow-sm">
          <Navigation size={20} />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{t('rastreo.titulo')}</h1>
          <p className="text-sm text-slate-400">{t('rastreo.subtitulo')}</p>
        </div>
      </div>
      <div className="flex-1 rounded-2xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)] relative">
        <MapboxFleetMap />
      </div>
    </div>
  );
}
