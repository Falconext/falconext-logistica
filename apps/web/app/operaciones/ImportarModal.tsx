'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Download, Info, CheckCircle2, AlertTriangle, CopyX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useT } from '../../lib/i18n';

// Columnas de la plantilla, en el orden en que se descargan. `key` es la clave
// canónica que entiende el backend; `header` es lo que ve el usuario en el Excel.
// El archivo del usuario NO tiene que llamarse igual: las cabeceras se reconocen
// por ALIAS (ver ALIASES) sin distinguir mayúsculas ni acentos.
const COLUMNAS: { key: string; header: string; ejemplo: string }[] = [
    { key: 'fecha', header: 'Fecha', ejemplo: '2026-09-01' },
    { key: 'codigo', header: 'Código', ejemplo: 'EX-10432' },
    { key: 'spedizione', header: 'Spedizione', ejemplo: 'EXTRAS PIAZZA MILANO' },
    { key: 'cliente', header: 'Cliente', ejemplo: 'Farmacia Centrale' },
    { key: 'chofer', header: 'Chofer', ejemplo: 'Moisés Gamonal' },
    { key: 'placa', header: 'Placa', ejemplo: 'GX123AB' },
    { key: 'lugar_retiro', header: 'Lugar de retiro', ejemplo: 'Peschiera Borromeo (Bettola)' },
    { key: 'hora_retiro', header: 'Hora de retiro', ejemplo: '08:30' },
    { key: 'lugar_entrega', header: 'Lugar de entrega', ejemplo: 'Via Roma 12, Milano' },
    { key: 'fecha_entrega', header: 'Fecha de entrega', ejemplo: '2026-09-01' },
    { key: 'hora_entrega', header: 'Hora de entrega', ejemplo: '14:00' },
    { key: 'km', header: 'Km', ejemplo: '120' },
    { key: 'km_facturable', header: 'Km facturable', ejemplo: '110' },
    { key: 'ingreso', header: 'Ingreso', ejemplo: '99' },
    { key: 'nota', header: 'Nota', ejemplo: '' },
];

// Nombres alternativos aceptados por columna (español e italiano, como los escribe
// la gente). Se comparan normalizados: sin acentos, en minúsculas y sin espacios dobles.
const ALIASES: Record<string, string[]> = {
    fecha: ['fecha', 'data', 'fecha operacion', 'fecha de operacion', 'dia'],
    codigo: ['codigo', 'code', 'codice', 'codigo de entrega', 'codigo entrega', 'cod'],
    spedizione: ['spedizione', 'spedicion', 'expedicion', 'servicio'],
    cliente: ['cliente', 'destinatario'],
    chofer: ['chofer', 'conductor', 'autista', 'trabajador', 'driver'],
    placa: ['placa', 'targa', 'vehiculo', 'mezzo', 'furgon'],
    lugar_retiro: ['lugar de retiro', 'lugar retiro', 'retiro', 'origen', 'luogo ritiro', 'ritiro'],
    hora_retiro: ['hora de retiro', 'hora retiro', 'ora ritiro', 'hora origen'],
    lugar_entrega: ['lugar de entrega', 'lugar entrega', 'entrega', 'destino', 'luogo consegna', 'consegna'],
    fecha_entrega: ['fecha de entrega', 'fecha entrega', 'data consegna'],
    hora_entrega: ['hora de entrega', 'hora entrega', 'ora consegna', 'hora destino'],
    km: ['km', 'kilometros', 'kms', 'chilometri'],
    km_facturable: ['km facturable', 'km facturado', 'km fatturabile', 'km facturables'],
    ingreso: ['ingreso', 'importe', 'monto', 'incasso', 'precio'],
    nota: ['nota', 'notas', 'observaciones', 'observacion', 'comentario'],
    estado: ['estado', 'stato'],
};

const normalizar = (s: string) =>
    String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Cabecera del archivo → clave canónica. null si la columna no se reconoce (se ignora).
function claveDeCabecera(header: string): string | null {
    const h = normalizar(header);
    for (const [key, alias] of Object.entries(ALIASES)) if (alias.includes(h)) return key;
    return null;
}

type FilaResultado = { fila: number; estado: 'NUEVA' | 'DUPLICADA' | 'ERROR'; codigo: string | null; mensaje?: string };
type Informe = { simulacion: boolean; total: number; nuevas: number; duplicadas: number; errores: number; filas: FilaResultado[] };

export default function ImportarModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const t = useT();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const inputRef = useRef<HTMLInputElement>(null);
    const [archivo, setArchivo] = useState<string>('');
    // Filas ya mapeadas a las claves canónicas — es lo que se manda al backend.
    const [filas, setFilas] = useState<any[]>([]);
    const [columnasIgnoradas, setColumnasIgnoradas] = useState<string[]>([]);
    const [informe, setInforme] = useState<Informe | null>(null);
    const [cargando, setCargando] = useState(false);
    const [importando, setImportando] = useState(false);
    const [terminado, setTerminado] = useState(false);

    const descargarPlantilla = async () => {
        const xlsx = await import('xlsx');
        const ws = xlsx.utils.json_to_sheet([
            Object.fromEntries(COLUMNAS.map((c) => [c.header, c.ejemplo])),
        ]);
        ws['!cols'] = COLUMNAS.map((c) => ({ wch: Math.max(c.header.length, 16) }));
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Operaciones');
        xlsx.writeFile(wb, 'Plantilla_Operaciones.xlsx');
    };

    const leerArchivo = async (file: File) => {
        setCargando(true);
        setInforme(null);
        setTerminado(false);
        try {
            const xlsx = await import('xlsx');
            const buf = await file.arrayBuffer();
            // cellDates deja las fechas como Date en vez del número de serie de Excel.
            const wb = xlsx.read(buf, { type: 'array', cellDates: true });
            const hoja = wb.Sheets[wb.SheetNames[0]];
            if (!hoja) throw new Error('vacío');
            const crudas: any[] = xlsx.utils.sheet_to_json(hoja, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
            if (!crudas.length) {
                toast.error(t('operaciones.importar.toastVacio'));
                return;
            }
            const ignoradas = new Set<string>();
            const mapeadas = crudas.map((row, i) => {
                const out: any = { __fila: i + 2 }; // +2: fila 1 = cabecera
                Object.entries(row).forEach(([header, valor]) => {
                    const key = claveDeCabecera(header);
                    if (!key) { if (String(valor ?? '').trim() !== '') ignoradas.add(header); return; }
                    out[key] = valor;
                });
                return out;
            // Una fila totalmente vacía (típica al final de un Excel) no se manda.
            }).filter((r) => Object.keys(r).some((k) => k !== '__fila' && String(r[k] ?? '').trim() !== ''));

            if (!mapeadas.length) {
                toast.error(t('operaciones.importar.toastVacio'));
                return;
            }
            setArchivo(file.name);
            setFilas(mapeadas);
            setColumnasIgnoradas([...ignoradas]);
            // Simulación automática: el usuario ve qué entra ANTES de confirmar.
            const res = await api.post<Informe>('/programacion/importar', { filas: mapeadas, simular: true });
            setInforme(res.data);
        } catch (error: any) {
            console.error(error);
            const detalle = error?.response?.data?.message;
            toast.error((Array.isArray(detalle) ? detalle[0] : detalle) || t('operaciones.importar.toastErrorLeer'));
        } finally {
            setCargando(false);
        }
    };

    const confirmar = async () => {
        if (!filas.length) return;
        setImportando(true);
        try {
            const res = await api.post<Informe>('/programacion/importar', { filas, simular: false });
            setInforme(res.data);
            setTerminado(true);
            if (res.data.nuevas > 0) {
                toast.success(t('operaciones.importar.toastImportadas').replace('{n}', String(res.data.nuevas)));
                onSuccess();
            } else {
                toast.error(t('operaciones.importar.toastNingunaNueva'));
            }
        } catch (error: any) {
            console.error(error);
            const detalle = error?.response?.data?.message;
            toast.error((Array.isArray(detalle) ? detalle[0] : detalle) || t('operaciones.importar.toastErrorImportar'));
        } finally {
            setImportando(false);
        }
    };

    if (!mounted) return null;

    // Solo se listan las filas problemáticas: las nuevas no necesitan explicación.
    const problemas = informe?.filas.filter((f) => f.estado !== 'NUEVA') ?? [];

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-[#0F172A] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-slate-200/70 dark:border-slate-800 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 sm:p-6 border-b border-slate-200/70 dark:border-slate-800 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                            <Upload size={18} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('operaciones.importar.modalTitulo')}</h2>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t('operaciones.importar.modalSubtitulo')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 sm:p-6 space-y-4">
                    {/* Plantilla + selector de archivo */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            type="button"
                            onClick={descargarPlantilla}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium text-sm"
                        >
                            <Download size={16} /> {t('operaciones.importar.descargarPlantilla')}
                        </button>
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={cargando}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm transition-all disabled:opacity-50"
                        >
                            {cargando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                            {cargando ? t('operaciones.importar.leyendo') : t('operaciones.importar.elegirArchivo')}
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) leerArchivo(f); e.target.value = ''; }}
                        />
                    </div>

                    {/* Qué debe tener el archivo */}
                    {!informe && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold uppercase text-slate-500">
                                {t('operaciones.importar.columnasTitulo')}
                            </div>
                            <div className="p-4 flex flex-wrap gap-1.5">
                                {COLUMNAS.map((c) => (
                                    <span key={c.key} className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                        {c.header}
                                    </span>
                                ))}
                            </div>
                            <div className="px-4 pb-4 -mt-1">
                                <p className="text-xs text-slate-500 leading-relaxed">{t('operaciones.importar.columnasNota')}</p>
                            </div>
                        </div>
                    )}

                    {/* Resumen de la simulación / del resultado */}
                    {informe && (
                        <>
                            <div className="text-xs text-slate-500 truncate">{archivo} · {informe.total} {t('operaciones.importar.filas')}</div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-3">
                                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase">
                                        <CheckCircle2 size={13} /> {terminado ? t('operaciones.importar.importadas') : t('operaciones.importar.nuevas')}
                                    </div>
                                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{informe.nuevas}</div>
                                </div>
                                <div className="rounded-xl border border-amber-100 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-3">
                                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase">
                                        <CopyX size={13} /> {t('operaciones.importar.duplicadas')}
                                    </div>
                                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{informe.duplicadas}</div>
                                </div>
                                <div className="rounded-xl border border-red-100 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-3">
                                    <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 text-xs font-bold uppercase">
                                        <AlertTriangle size={13} /> {t('operaciones.importar.conError')}
                                    </div>
                                    <div className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{informe.errores}</div>
                                </div>
                            </div>

                            {columnasIgnoradas.length > 0 && (
                                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                                    <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        {t('operaciones.importar.columnasIgnoradas')}: {columnasIgnoradas.join(', ')}
                                    </p>
                                </div>
                            )}

                            {problemas.length > 0 && (
                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold uppercase text-slate-500">
                                        {t('operaciones.importar.detalleTitulo')}
                                    </div>
                                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                                        {problemas.map((f) => (
                                            <div key={`${f.fila}-${f.estado}`} className="px-4 py-2 flex items-start gap-2.5 text-xs">
                                                <span className="shrink-0 font-mono text-slate-400 w-12">{t('operaciones.importar.fila')} {f.fila}</span>
                                                <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${f.estado === 'DUPLICADA' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'}`}>
                                                    {f.estado === 'DUPLICADA' ? t('operaciones.importar.duplicada') : t('operaciones.importar.error')}
                                                </span>
                                                <span className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                                    {f.codigo ? <span className="font-mono text-slate-400">{f.codigo} · </span> : null}
                                                    {f.mensaje}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!terminado && (
                                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
                                    <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                    <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{t('operaciones.importar.notaSimulacion')}</p>
                                </div>
                            )}
                        </>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                        >
                            {terminado ? t('operaciones.importar.cerrar') : t('operaciones.importar.cancelar')}
                        </button>
                        {!terminado && (
                            <button
                                type="button"
                                onClick={confirmar}
                                disabled={importando || !informe || informe.nuevas === 0}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {importando
                                    ? t('operaciones.importar.importando')
                                    : t('operaciones.importar.confirmar').replace('{n}', String(informe?.nuevas ?? 0))}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
