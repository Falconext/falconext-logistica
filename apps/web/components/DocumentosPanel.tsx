'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    UploadCloud, Loader2, FileText, Eye, Trash2, X, ExternalLink, Download,
    type LucideIcon,
} from 'lucide-react';
import api from '../lib/api';
import { Documento } from '../types';
import DatePicker from './DatePicker';

/**
 * Panel de documentación genérico para cualquier entidad (TRABAJADOR, VEHICULO…).
 * Cada tipo de documento es una "casilla": permite subir el PDF/escaneo y guardar
 * la fecha de vencimiento al lado. Se persiste en el modelo genérico Documento
 * (entidad + entidad_id + tipo=<clave>).
 */

export interface DocType {
    key: string;
    label: string;      // nombre mostrado (p. ej. en italiano, como en la ficha original)
    sub: string;        // aclaración en español
    icon: LucideIcon;
    muted?: boolean;    // color gris (documentos secundarios)
}

// --- Previsualización ---------------------------------------------------
const isPdf = (url?: string | null) => !!url && /\.pdf(\?|$)/i.test(url);
// Renderiza una página de un PDF de Cloudinary como JPG (sin libs). Cloudinary
// bloquea la entrega del PDF crudo (401) pero sí permite transformarlo a imagen,
// así que previsualizamos página por página con `pg_N,f_jpg`.
const pdfPage = (url: string, page = 1, w = 600) =>
    url.replace('/upload/', `/upload/pg_${page},f_jpg,q_auto,w_${w}/`).replace(/\.pdf(\?|$)/i, '.jpg$1');
const pdfThumb = (url: string, w = 600) => pdfPage(url, 1, w);

// ISO datetime -> 'YYYY-MM-DD' para el DatePicker.
const toDateInput = (v?: string | null) => (v ? new Date(v).toISOString().split('T')[0] : '');

function checkExpiration(dateStr?: string | null) {
    if (!dateStr) return { label: 'Sin fecha', color: 'text-slate-400 bg-slate-100 dark:bg-slate-800' };
    const date = new Date(dateStr);
    const today = new Date();
    const thirty = new Date();
    thirty.setDate(today.getDate() + 30);
    if (date < today) return { label: 'Vencido', color: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400' };
    if (date < thirty) return { label: 'Por vencer', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' };
    return { label: 'Vigente', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' };
}

export default function DocumentosPanel({
    entidad, entidadId, docTypes,
}: {
    entidad: string;
    entidadId: string;
    docTypes: DocType[];
}) {
    const [docsByTipo, setDocsByTipo] = useState<Record<string, Documento>>({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<Record<string, boolean>>({});
    const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);

    const fetchDocs = useCallback(async () => {
        try {
            const res = await api.get('/documentos', { params: { entidad, entidad_id: entidadId } });
            const map: Record<string, Documento> = {};
            (Array.isArray(res.data) ? res.data : []).forEach((d: Documento) => {
                // Primer registro por tipo (el endpoint ordena por creado_en desc).
                if (!map[d.tipo]) map[d.tipo] = d;
            });
            setDocsByTipo(map);
        } catch {
            /* silencioso */
        } finally {
            setLoading(false);
        }
    }, [entidad, entidadId]);

    useEffect(() => { fetchDocs(); }, [fetchDocs]);

    /**
     * Guarda una casilla (upsert). `patch` puede traer url y/o fecha (null = quitar).
     * Si la casilla queda sin url y sin fecha, se elimina el registro.
     */
    const saveSlot = async (dt: DocType, patch: { url?: string | null; fecha?: string | null }) => {
        const existing = docsByTipo[dt.key];
        const nextUrl = patch.url !== undefined ? patch.url : existing?.url ?? null;
        const nextFecha =
            patch.fecha !== undefined ? patch.fecha : (existing ? toDateInput(existing.fecha_vencimiento) : null);

        setBusy((b) => ({ ...b, [dt.key]: true }));
        try {
            if (existing) {
                if (!nextUrl && !nextFecha) {
                    await api.delete(`/documentos/${existing.id}`);
                } else {
                    await api.patch(`/documentos/${existing.id}`, {
                        url: nextUrl,
                        fecha_vencimiento: nextFecha || null,
                    });
                }
            } else {
                if (!nextUrl && !nextFecha) return;
                await api.post('/documentos', {
                    entidad,
                    entidad_id: entidadId,
                    tipo: dt.key,
                    nombre: dt.label,
                    url: nextUrl,
                    fecha_vencimiento: nextFecha || null,
                });
            }
            await fetchDocs();
        } catch {
            alert('No se pudo guardar el documento.');
        } finally {
            setBusy((b) => ({ ...b, [dt.key]: false }));
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-400 animate-pulse">Cargando documentos…</div>;
    }

    return (
        <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {docTypes.map((dt) => (
                    <DocCard
                        key={dt.key}
                        dt={dt}
                        doc={docsByTipo[dt.key]}
                        busy={!!busy[dt.key]}
                        onSave={(patch) => saveSlot(dt, patch)}
                        onPreview={(url) => setPreview({ url, label: dt.label })}
                    />
                ))}
            </div>

            {preview && <PreviewModal url={preview.url} label={preview.label} onClose={() => setPreview(null)} />}
        </div>
    );
}

function PreviewModal({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const pdf = isPdf(url);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
            onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl h-[92vh] sm:h-[88vh] sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}>
                <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                        <FileText size={18} className="text-blue-500 flex-shrink-0" /> {label}
                    </h3>
                    <div className="flex items-center gap-1">
                        <a href={url} target="_blank" rel="noreferrer" title="Abrir en pestaña nueva"
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><ExternalLink size={18} /></a>
                        <a href={url} download title="Descargar"
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><Download size={18} /></a>
                        <button onClick={onClose} title="Cerrar"
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X size={20} /></button>
                    </div>
                </div>
                <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-auto">
                    {pdf ? (
                        <PdfPages url={url} label={label} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center p-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={label} className="max-w-full max-h-full object-contain" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Visor multipágina: descubre las páginas del PDF cargándolas una a una como
// JPG (Cloudinary). Al fallar la siguiente página, se detiene.
function PdfPages({ url, label }: { url: string; label: string }) {
    const [pages, setPages] = useState<number[]>([1]);
    const [done, setDone] = useState(false);
    const MAX = 30;

    return (
        <div className="flex flex-col items-center gap-3 p-3">
            {pages.map((n) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    key={n}
                    src={pdfPage(url, n, 1000)}
                    alt={`${label} — página ${n}`}
                    className="max-w-full shadow-lg bg-white"
                    onLoad={() => {
                        if (!done && n === pages[pages.length - 1] && pages.length < MAX) {
                            setPages((p) => [...p, p.length + 1]);
                        }
                    }}
                    onError={() => {
                        setDone(true);
                        setPages((p) => p.filter((x) => x < n));
                    }}
                />
            ))}
            {pages.length === 0 && (
                <p className="text-slate-400 text-sm p-8">No se pudo mostrar el documento.</p>
            )}
        </div>
    );
}

function DocCard({
    dt, doc, busy, onSave, onPreview,
}: {
    dt: DocType;
    doc?: Documento;
    busy: boolean;
    onSave: (patch: { url?: string | null; fecha?: string | null }) => void | Promise<void>;
    onPreview: (url: string) => void;
}) {
    const Icon = dt.icon;
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [thumbError, setThumbError] = useState(false);
    const status = checkExpiration(doc?.fecha_vencimiento);
    const hasFile = !!doc?.url;
    const fileUrl = doc?.url || '';
    const thumbSrc = isPdf(fileUrl) ? pdfThumb(fileUrl) : fileUrl;
    useEffect(() => { setThumbError(false); }, [fileUrl]);

    const handleFile = async (file: File) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setError('Máx 5MB'); return; }
        setError('');
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await api.post('/files/upload', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            await onSave({ url: res.data.url });
        } catch {
            setError('Error al subir');
        } finally {
            setUploading(false);
        }
    };

    const iconWrap = dt.muted
        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400';

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
                    <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white text-sm leading-tight truncate">{dt.label}</div>
                    <div className="text-xs text-slate-400 truncate">{dt.sub}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${status.color}`}>
                    {status.label}
                </span>
            </div>

            {/* Vencimiento */}
            <DatePicker
                label="Vencimiento"
                value={toDateInput(doc?.fecha_vencimiento)}
                onChange={(v) => onSave({ fecha: v || null })}
            />

            {/* Archivo (PDF / escaneo) — miniatura con previsualización */}
            {hasFile ? (
                <div className="space-y-2">
                    <button type="button" onClick={() => onPreview(fileUrl)}
                        className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 group">
                        {thumbError ? (
                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
                                <FileText size={28} /> <span className="text-xs">Documento</span>
                            </span>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbSrc} alt={dt.label} onError={() => setThumbError(true)}
                                className="w-full h-full object-cover object-top" />
                        )}
                        {isPdf(fileUrl) && (
                            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">PDF</span>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition">
                            <span className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-slate-900 text-xs font-semibold">
                                <Eye size={14} /> Previsualizar
                            </span>
                        </span>
                    </button>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || busy}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50">
                            {uploading ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />} Cambiar
                        </button>
                        <button type="button" onClick={() => onSave({ url: null })} disabled={busy}
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 hover:text-red-500 hover:border-red-200 transition disabled:opacity-50">
                            <Trash2 size={14} /> Quitar
                        </button>
                    </div>
                </div>
            ) : (
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || busy}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:border-blue-400 transition text-sm font-medium disabled:opacity-50">
                    {uploading ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                    {uploading ? 'Subiendo…' : 'Subir PDF'}
                </button>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
            {busy && !uploading && <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="animate-spin" size={12} /> Guardando…</p>}

            <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>
    );
}
