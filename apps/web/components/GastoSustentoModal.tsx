'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import MultiFileUpload from './MultiFileUpload';
import { useT } from '../lib/i18n';

/**
 * Sustento posterior de un gasto "Desde operación" (peaje o combustible):
 * comprobantes + (solo peaje) nº de mancato y link de pago. Pedido de Gamonal:
 * muchos mancatos quedan sin foto y sin ella no se puede pagar; antes el panel
 * solo permitía VER esas filas. No toca monto/estado (eso sigue en la operación).
 */
interface Props {
    item: any | null;           // fila del módulo (id "gasto:<uuid>", _origen 'operacion')
    tipo: 'PEAJE' | 'COMBUSTIBLE';
    onClose: () => void;
    onSaved: () => void;
}

export default function GastoSustentoModal({ item, tipo, onClose, onSaved }: Props) {
    const t = useT();
    const [mounted, setMounted] = useState(false);
    const [comprobantes, setComprobantes] = useState<string[]>([]);
    const [numero, setNumero] = useState('');
    const [link, setLink] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        if (!item) return;
        setComprobantes(Array.isArray(item.comprobantes) ? item.comprobantes : (item.archivo ? [item.archivo] : []));
        setNumero(item.numero_mancato || '');
        setLink(item.link_peaje || '');
    }, [item]);

    if (!mounted || !item) return null;
    const gastoId = String(item.id).replace(/^gasto:/, '');

    const save = async () => {
        setSaving(true);
        try {
            await api.patch(`/programacion/gastos/${gastoId}/sustento`, {
                comprobantes,
                ...(tipo === 'PEAJE' ? { numero_mancato: numero.trim() || null, link_peaje: link.trim() || null } : {}),
            });
            toast.success(t('componentes.sustento.guardado'));
            onSaved();
            onClose();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('componentes.sustento.error'));
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
            <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('componentes.sustento.titulo')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('componentes.sustento.subtitulo')}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"><X size={18} /></button>
                </div>

                {tipo === 'PEAJE' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('componentes.sustento.numeroMancato')}</span>
                            <input value={numero} onChange={(e) => setNumero(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent text-sm outline-none focus:border-blue-500" />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('componentes.sustento.linkPago')}</span>
                            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent text-sm outline-none focus:border-blue-500" />
                        </label>
                    </div>
                )}

                <div className="mb-5">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('componentes.sustento.comprobantes')}</span>
                    <div className="mt-1">
                        <MultiFileUpload value={comprobantes} onChange={setComprobantes} label={t('componentes.sustento.agregar')} />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">{t('componentes.sustento.cancelar')}</button>
                    <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {t('componentes.sustento.guardar')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
