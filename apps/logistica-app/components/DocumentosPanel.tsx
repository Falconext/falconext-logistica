import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Modal, Pressable, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  UploadCloud, FileText, Eye, Trash2, X, ExternalLink,
  type LucideIcon,
} from 'lucide-react-native';
import { FormModal, Badge, LoadingState } from './ui';
import DatePicker from './DatePicker';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import api from '../services/api';
import type { Documento } from '../types';

const C = Theme.colors;
const S = Theme.spacing;

// Tipo de documento genérico (las listas por entidad viven en ./documentTypes).
export interface DocType { key: string; label: string; sub: string; icon: LucideIcon; muted?: boolean; }

// --- Previsualización -------------------------------------------------------
const isPdf = (url?: string | null) => !!url && /\.pdf(\?|$)/i.test(url);
// Renderiza una página de un PDF de Cloudinary como JPG (sin visor PDF nativo).
// Cloudinary bloquea la entrega del PDF crudo (401) pero sí permite transformarlo
// a imagen, así que previsualizamos página por página con `pg_N,f_jpg`.
const pdfPage = (url: string, page = 1, w = 600) =>
  url.replace('/upload/', `/upload/pg_${page},f_jpg,q_auto,w_${w}/`).replace(/\.pdf(\?|$)/i, '.jpg$1');
const pdfThumb = (url: string, w = 600) => pdfPage(url, 1, w);

const toDateInput = (v?: string | null) => (v ? new Date(v).toISOString().split('T')[0] : '');

type Variant = 'success' | 'warning' | 'danger' | 'neutral';
function checkExpiration(dateStr?: string | null): { label: string; variant: Variant } {
  if (!dateStr) return { label: 'Sin fecha', variant: 'neutral' };
  const date = new Date(dateStr);
  const today = new Date();
  const thirty = new Date();
  thirty.setDate(today.getDate() + 30);
  if (date < today) return { label: 'Vencido', variant: 'danger' };
  if (date < thirty) return { label: 'Por vencer', variant: 'warning' };
  return { label: 'Vigente', variant: 'success' };
}

// Sube un archivo (imagen o PDF) a /files/upload y devuelve la URL de Cloudinary.
async function uploadAsset(asset: { uri: string; name: string; type: string }): Promise<string> {
  const form = new FormData();
  // @ts-ignore — forma de archivo en React Native
  form.append('file', { uri: asset.uri, name: asset.name, type: asset.type });
  const res = await api.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data.url;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  entidad: string;
  entidadId: string;
  docTypes: DocType[];
  nombre?: string;
}

export default function DocumentosPanel({ visible, onClose, entidad, entidadId, docTypes, nombre }: Props) {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const [docsByTipo, setDocsByTipo] = useState<Record<string, Documento>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await api.get('/documentos', { params: { entidad, entidad_id: entidadId } });
      const map: Record<string, Documento> = {};
      (Array.isArray(res.data) ? res.data : []).forEach((d: Documento) => { if (!map[d.tipo]) map[d.tipo] = d; });
      setDocsByTipo(map);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, [entidad, entidadId]);

  useEffect(() => {
    if (visible) { setLoading(true); fetchDocs(); }
  }, [visible, fetchDocs]);

  const saveSlot = async (dt: DocType, patch: { url?: string | null; fecha?: string | null }) => {
    const existing = docsByTipo[dt.key];
    const nextUrl = patch.url !== undefined ? patch.url : existing?.url ?? null;
    const nextFecha = patch.fecha !== undefined ? patch.fecha : (existing ? toDateInput(existing.fecha_vencimiento) : null);
    setBusy((b) => ({ ...b, [dt.key]: true }));
    try {
      if (existing) {
        if (!nextUrl && !nextFecha) {
          await api.delete(`/documentos/${existing.id}`);
        } else {
          await api.patch(`/documentos/${existing.id}`, { url: nextUrl, fecha_vencimiento: nextFecha || null });
        }
      } else {
        if (!nextUrl && !nextFecha) return;
        await api.post('/documentos', {
          entidad, entidad_id: entidadId, tipo: dt.key,
          nombre: dt.label, url: nextUrl, fecha_vencimiento: nextFecha || null,
        });
      }
      await fetchDocs();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el documento.');
    } finally {
      setBusy((b) => ({ ...b, [dt.key]: false }));
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title={nombre ? `Documentos · ${nombre}` : 'Documentos'}>
      {loading ? (
        <LoadingState text="Cargando documentos..." />
      ) : (
        <View style={{ gap: S.md }}>
          {docTypes.map((dt) => (
            <DocCard
              key={dt.key}
              dt={dt}
              doc={docsByTipo[dt.key]}
              busy={!!busy[dt.key]}
              styles={styles}
              onSave={(patch) => saveSlot(dt, patch)}
              onPreview={(url) => setPreview({ url, label: dt.label })}
            />
          ))}
        </View>
      )}

      {preview && (
        <PreviewModal url={preview.url} label={preview.label} styles={styles} onClose={() => setPreview(null)} />
      )}
    </FormModal>
  );
}

function DocCard({
  dt, doc, busy, styles, onSave, onPreview,
}: {
  dt: DocType;
  doc?: Documento;
  busy: boolean;
  styles: ReturnType<typeof makeStyles>;
  onSave: (patch: { url?: string | null; fecha?: string | null }) => void | Promise<void>;
  onPreview: (url: string) => void;
}) {
  const Icon = dt.icon;
  const [uploading, setUploading] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const status = checkExpiration(doc?.fecha_vencimiento);
  const fileUrl = doc?.url || '';
  const hasFile = !!fileUrl;
  const thumbSrc = isPdf(fileUrl) ? pdfThumb(fileUrl) : fileUrl;
  useEffect(() => { setThumbError(false); }, [fileUrl]);

  const doUpload = async (asset: { uri: string; name: string; type: string }) => {
    setUploading(true);
    try {
      const url = await uploadAsset(asset);
      await onSave({ url });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos la cámara para escanear el documento.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      const name = a.fileName || `escaneo_${dt.key}.jpg`;
      doUpload({ uri: a.uri, name, type: a.mimeType || 'image/jpeg' });
    }
  };
  const fromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos acceso a la galería.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      const name = a.fileName || `imagen_${dt.key}.jpg`;
      doUpload({ uri: a.uri, name, type: a.mimeType || 'image/jpeg' });
    }
  };
  const fromDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      doUpload({ uri: a.uri, name: a.name || `documento_${dt.key}.pdf`, type: a.mimeType || 'application/pdf' });
    }
  };

  const pick = () => {
    Alert.alert(dt.label, 'Adjuntar documento', [
      { text: 'Tomar foto', onPress: fromCamera },
      { text: 'Elegir de galería', onPress: fromLibrary },
      { text: 'Archivo PDF', onPress: fromDocument },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, dt.muted ? styles.iconMuted : styles.iconPrimary]}>
          <Icon size={20} color={dt.muted ? C.textMuted : C.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{dt.label}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>{dt.sub}</Text>
        </View>
        <Badge label={status.label} variant={status.variant} />
      </View>

      {/* Vencimiento */}
      <DatePicker
        label="Vencimiento"
        value={toDateInput(doc?.fecha_vencimiento)}
        onChange={(v) => onSave({ fecha: v || null })}
        placeholder="Sin fecha"
      />

      {/* Archivo */}
      {hasFile ? (
        <View style={{ gap: S.sm, marginTop: S.sm }}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => onPreview(fileUrl)} style={styles.thumbWrap}>
            {thumbError ? (
              <View style={styles.thumbFallback}>
                <FileText size={28} color={C.textFaint} />
                <Text style={styles.thumbFallbackText}>Documento</Text>
              </View>
            ) : (
              <Image source={{ uri: thumbSrc }} style={styles.thumb} contentFit="cover" onError={() => setThumbError(true)} />
            )}
            {isPdf(fileUrl) && <View style={styles.pdfBadge}><Text style={styles.pdfBadgeText}>PDF</Text></View>}
            <View style={styles.thumbOverlay}>
              <Eye size={16} color="#fff" />
              <Text style={styles.thumbOverlayText}>Previsualizar</Text>
            </View>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <TouchableOpacity onPress={pick} disabled={uploading || busy} style={[styles.smallBtn, { flex: 1 }]}>
              {uploading ? <ActivityIndicator size="small" color={C.textMuted} /> : <UploadCloud size={15} color={C.textMuted} />}
              <Text style={styles.smallBtnText}>Cambiar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSave({ url: null })} disabled={busy} style={styles.smallBtn}>
              <Trash2 size={15} color={C.danger} />
              <Text style={[styles.smallBtnText, { color: C.danger }]}>Quitar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={pick} disabled={uploading || busy} style={styles.dropzone} activeOpacity={0.7}>
          {uploading ? <ActivityIndicator color={C.primary} /> : <UploadCloud size={20} color={C.textFaint} />}
          <Text style={styles.dropText}>{uploading ? 'Subiendo...' : 'Subir PDF o foto'}</Text>
        </TouchableOpacity>
      )}
      {busy && !uploading && (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={C.textFaint} />
          <Text style={styles.savingText}>Guardando…</Text>
        </View>
      )}
    </View>
  );
}

function PreviewModal({
  url, label, styles, onClose,
}: {
  url: string; label: string; styles: ReturnType<typeof makeStyles>; onClose: () => void;
}) {
  const pdf = isPdf(url);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewRoot}>
        <View style={styles.previewHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <FileText size={18} color="#fff" />
            <Text style={styles.previewTitle} numberOfLines={1}>{label}</Text>
          </View>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(url)} hitSlop={8} style={styles.previewIconBtn}>
            <ExternalLink size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.previewIconBtn}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {pdf ? (
          <PdfPagesMobile url={url} label={label} styles={styles} />
        ) : (
          <ImagePreview url={url} styles={styles} onClose={onClose} />
        )}

        <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(url)} style={styles.previewOpenBtn} activeOpacity={0.85}>
          <ExternalLink size={18} color={C.textOnPrimary} />
          <Text style={styles.previewOpenText}>Abrir / descargar original</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function ImagePreview({ url, styles, onClose }: { url: string; styles: ReturnType<typeof makeStyles>; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <Pressable style={styles.previewBody} onPress={onClose}>
      {imgError ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <FileText size={48} color="rgba(255,255,255,0.6)" />
          <Text style={styles.previewHint}>No se pudo mostrar el documento.</Text>
        </View>
      ) : (
        <Image source={{ uri: url }} style={styles.previewImage} contentFit="contain" onError={() => setImgError(true)} />
      )}
    </Pressable>
  );
}

// Visor multipágina: carga las páginas del PDF una a una como JPG (Cloudinary).
// Al fallar la siguiente página, se detiene.
function PdfPagesMobile({ url, label, styles }: { url: string; label: string; styles: ReturnType<typeof makeStyles> }) {
  const [pages, setPages] = useState<number[]>([1]);
  const [done, setDone] = useState(false);
  const MAX = 30;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pdfScroll}>
      {pages.map((n) => (
        <Image
          key={n}
          source={{ uri: pdfPage(url, n, 1000) }}
          style={styles.pdfPage}
          contentFit="contain"
          onLoad={() => {
            if (!done && n === pages[pages.length - 1] && pages.length < MAX) {
              setPages((p) => [...p, p.length + 1]);
            }
          }}
          onError={() => { setDone(true); setPages((p) => p.filter((x) => x < n)); }}
        />
      ))}
      {pages.length === 0 && (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40 }}>
          <FileText size={48} color="rgba(255,255,255,0.6)" />
          <Text style={styles.previewHint}>No se pudo mostrar el documento.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: S.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm },
  iconWrap: { width: 42, height: 42, borderRadius: Theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  iconPrimary: { backgroundColor: C.primarySoft },
  iconMuted: { backgroundColor: C.neutralSoft },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  cardSub: { fontSize: 12, color: C.textFaint, marginTop: 1 },
  thumbWrap: {
    height: 150, borderRadius: Theme.radius.md, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.surfaceAlt,
  },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  thumbFallbackText: { fontSize: 12, color: C.textFaint },
  pdfBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: C.danger, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  pdfBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  thumbOverlay: {
    position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  thumbOverlayText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: S.sm, paddingHorizontal: S.md, borderRadius: Theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.surfaceAlt,
  },
  smallBtnText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  dropzone: {
    marginTop: S.sm, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: S.lg,
    borderRadius: Theme.radius.md, borderWidth: 2, borderColor: C.border, borderStyle: 'dashed', backgroundColor: C.surfaceAlt,
  },
  dropText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: S.sm },
  savingText: { fontSize: 12, color: C.textFaint },
  // Preview modal
  previewRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 52, paddingHorizontal: S.lg, paddingBottom: S.md },
  previewTitle: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  previewIconBtn: { padding: 6 },
  previewBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md },
  previewImage: { width: '100%', height: '100%' },
  pdfScroll: { padding: S.md, gap: S.md, alignItems: 'center' },
  pdfPage: { width: '100%', aspectRatio: 1 / 1.414, backgroundColor: '#fff', borderRadius: 4 },
  previewHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  previewOpenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    margin: S.lg, marginBottom: 40, paddingVertical: S.md, borderRadius: Theme.radius.md, backgroundColor: C.primary,
  },
  previewOpenText: { color: C.textOnPrimary, fontSize: 15, fontWeight: '700' },
});
