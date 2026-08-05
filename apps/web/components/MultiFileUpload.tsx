'use client';

import { useRef, useState } from 'react';
import api from '../lib/api';
import { UploadCloud, Loader2, X, FileText } from 'lucide-react';

interface MultiFileUploadProps {
    value: string[];                         // URLs actuales
    onChange: (urls: string[]) => void;      // se llama con la lista actualizada
    accept?: string;
    label?: string;
    disabled?: boolean;
}

const isPdf = (url: string) => url.toLowerCase().includes('.pdf');
const fileName = (url: string) => {
    try { return decodeURIComponent(url.split('/').pop() || 'archivo'); } catch { return 'archivo'; }
};

/**
 * Sube uno o varios archivos a /files/upload y mantiene una lista de URLs.
 * Usado para los comprobantes de un gasto (peaje, combustible, etc.).
 */
export default function MultiFileUpload({
    value,
    onChange,
    accept = 'image/*,application/pdf',
    label = 'Agregar comprobante',
    disabled = false,
}: MultiFileUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const handleFiles = async (files: FileList) => {
        setError('');
        setUploading(true);
        try {
            const uploaded: string[] = [];
            for (const file of Array.from(files)) {
                if (file.size > 5 * 1024 * 1024) { setError('Cada archivo debe pesar menos de 5MB'); continue; }
                const fd = new FormData();
                fd.append('file', file);
                const res = await api.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                if (res.data?.url) uploaded.push(res.data.url);
            }
            if (uploaded.length) onChange([...(value || []), ...uploaded]);
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Error al subir el archivo');
        } finally {
            setUploading(false);
        }
    };

    const removeAt = (i: number) => onChange((value || []).filter((_, idx) => idx !== i));

    return (
        <div className="space-y-2">
            {value?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map((url, i) => (
                        <div key={url + i} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-slate-200 bg-white text-xs">
                            {isPdf(url) ? <FileText size={13} className="text-slate-500" /> : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={url} alt="comprobante" className="w-6 h-6 rounded object-cover" />
                            )}
                            <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 max-w-[120px] truncate">{fileName(url)}</a>
                            {!disabled && (
                                <button type="button" onClick={() => removeAt(i)} className="text-slate-400 hover:text-red-500">
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {!disabled && (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 hover:border-blue-400 text-slate-500 hover:text-blue-600 text-xs font-medium transition disabled:opacity-60"
                >
                    {uploading ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />}
                    {uploading ? 'Subiendo...' : label}
                </button>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={accept}
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
            />
        </div>
    );
}
