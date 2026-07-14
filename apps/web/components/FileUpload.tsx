'use client';

import { useRef, useState } from 'react';
import api from '../lib/api';
import { UploadCloud, Loader2, X, FileText } from 'lucide-react';

interface FileUploadProps {
  value?: string | null;            // URL actual (si ya hay archivo)
  onChange: (url: string) => void;  // se llama con la nueva URL de Cloudinary
  onClear?: () => void;
  label?: string;
  accept?: string;                  // p.ej. 'image/*' o 'image/*,application/pdf'
  variant?: 'avatar' | 'wide';      // avatar = miniatura circular; wide = zona de arrastre
}

/**
 * Sube un archivo a Cloudinary vía POST /files/upload y devuelve la URL.
 * Reutilizable para foto de trabajador, foto de vehículo, escaneos de
 * documentos y evidencia de mantenimiento.
 */
export default function FileUpload({
  value,
  onChange,
  onClear,
  label = 'Subir archivo',
  accept = 'image/*',
  variant = 'wide',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const isPdf = (url?: string | null) => !!url && url.toLowerCase().includes('.pdf');

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo supera 5MB');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/files/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data.url);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  if (variant === 'avatar') {
    return (
      <div className="flex items-center gap-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center cursor-pointer hover:border-blue-400 transition relative shrink-0"
        >
          {uploading ? (
            <Loader2 className="animate-spin text-slate-400" size={22} />
          ) : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="foto" className="w-full h-full object-cover" />
          ) : (
            <UploadCloud className="text-slate-400" size={22} />
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {value ? 'Cambiar foto' : label}
          </button>
          {value && onClear && (
            <button type="button" onClick={onClear} className="block text-xs text-red-500 mt-1">
              Quitar
            </button>
          )}
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onSelect} />
      </div>
    );
  }

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
          {isPdf(value) ? (
            <FileText className="text-slate-500" size={20} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="archivo" className="w-12 h-12 rounded-lg object-cover" />
          )}
          <a href={value} target="_blank" rel="noreferrer" className="flex-1 text-sm text-blue-600 truncate">
            Ver archivo
          </a>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Cambiar
          </button>
          {onClear && (
            <button type="button" onClick={onClear} className="text-slate-400 hover:text-red-500">
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-500 hover:text-blue-600 transition"
        >
          {uploading ? <Loader2 className="animate-spin" size={22} /> : <UploadCloud size={22} />}
          <span className="text-sm font-medium">{uploading ? 'Subiendo...' : label}</span>
          <span className="text-xs text-slate-400">Imagen o PDF · máx 5MB</span>
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onSelect} />
    </div>
  );
}
