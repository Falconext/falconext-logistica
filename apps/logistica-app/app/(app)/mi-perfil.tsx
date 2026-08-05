// Mi Perfil — ficha personal del chofer: datos, documentos con vencimientos
// (pasaporte, identidad, residencia, licencia, fiscal, contrato) y archivos
// adjuntos. Solo lectura: la edición la hace la empresa desde la web.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, RefreshControl, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FileText, ExternalLink, Phone, Mail, MapPin, BadgeCheck, Route, Clock, Moon, ClipboardList } from 'lucide-react-native';
import {
  Screen,
  AppHeader,
  Card,
  StatCard,
  Badge,
  LoadingState,
  SectionTitle,
  EmptyState,
  InfoRow,
  Theme,
} from '../../components/ui';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const C = Theme.colors;
const S = Theme.spacing;
const F = Theme.font;
const R = Theme.radius;

interface Perfil {
  id: string;
  id_trabajador?: string | null;
  nombre_completo: string;
  cargo?: string | null;
  estado_laboral?: string | null;
  nacionalidad?: string | null;
  url_foto?: string | null;
  telefono?: string | null;
  email_personal?: string | null;
  direccion?: string | null;
  area_trabajo?: string | null;
  numero_pasaporte?: string | null;
  fecha_vencimiento_pasaporte?: string | null;
  documento_identidad?: string | null;
  fecha_vencimiento_identidad?: string | null;
  permiso_residencia?: string | null;
  fecha_vencimiento_residencia?: string | null;
  licencia_conducir?: string | null;
  fecha_vencimiento_licencia?: string | null;
  traduccion_licencia?: string | null;
  fecha_vencimiento_traduccion?: string | null;
  codigo_fiscal?: string | null;
  fecha_vencimiento_fiscal?: string | null;
  tipo_contrato?: string | null;
  fecha_vencimiento_contrato?: string | null;
}

interface Archivo {
  id: string;
  tipo?: string | null;
  nombre?: string | null;
  url: string;
  fecha_vencimiento?: string | null;
}

// Métricas del mes del chofer (GET /registros/mias/resumen).
interface Resumen {
  totalPartes: number;
  km: number;
  oreMattina: number;
  oreSera: number;
  oreTotal: number;
}

// Horas de manejo en decimales (p. ej. 5.5 = 5h 30m).
function horasLabel(h: number): string {
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return min > 0 ? `${horas}h ${min}m` : `${horas}h`;
}

// Documentos del perfil: [etiqueta, campo número, campo vencimiento]
const DOCS: [string, keyof Perfil, keyof Perfil][] = [
  ['Licencia de conducir', 'licencia_conducir', 'fecha_vencimiento_licencia'],
  ['Traducción de licencia', 'traduccion_licencia', 'fecha_vencimiento_traduccion'],
  ['Pasaporte', 'numero_pasaporte', 'fecha_vencimiento_pasaporte'],
  ['Documento de identidad', 'documento_identidad', 'fecha_vencimiento_identidad'],
  ['Permiso de residencia', 'permiso_residencia', 'fecha_vencimiento_residencia'],
  ['Código fiscal', 'codigo_fiscal', 'fecha_vencimiento_fiscal'],
  ['Contrato', 'tipo_contrato', 'fecha_vencimiento_contrato'],
];

function fmtFecha(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Estado del documento según su vencimiento: vencido / por vencer (≤30 días) / vigente.
function vencimientoBadge(v?: string | null): { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' } | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const dias = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (dias < 0) return { label: 'Vencido', variant: 'danger' };
  if (dias <= 30) return { label: `Vence en ${dias}d`, variant: 'warning' };
  return { label: 'Vigente', variant: 'success' };
}

export default function MiPerfilScreen() {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const { user } = useAuth();

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [perfilRes, docsRes, resumenRes] = await Promise.all([
        api.get('/trabajadores/mi/perfil'),
        // El backend fuerza entidad=TRABAJADOR + su propio id para usuarios solo_propios.
        api.get('/documentos'),
        api.get('/registros/mias/resumen'),
      ]);
      setPerfil(perfilRes.data ?? null);
      setArchivos(Array.isArray(docsRes.data) ? docsRes.data : []);
      setResumen(resumenRes.data ?? null);
    } catch {
      // Silencioso: pull-to-refresh permite reintentar.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const docs = DOCS.map(([label, numKey, vencKey]) => ({
    label,
    numero: (perfil?.[numKey] as string) || null,
    venc: (perfil?.[vencKey] as string) || null,
  })).filter((d) => d.numero || d.venc);

  return (
    <Screen
      scroll
      padded
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <AppHeader title="Mi Perfil" subtitle="Tus datos y documentos" />

      {/* Cabecera de identidad */}
      <Card style={styles.identity}>
        {perfil?.url_foto ? (
          <Image source={{ uri: perfil.url_foto }} style={styles.photo} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(perfil?.nombre_completo?.[0] || 'C').toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{perfil?.nombre_completo || user?.nombre || '—'}</Text>
          <Text style={styles.cargo}>
            {[perfil?.cargo, perfil?.id_trabajador].filter(Boolean).join(' · ') || 'Chofer'}
          </Text>
        </View>
        <Badge
          label={perfil?.estado_laboral || 'Activo'}
          variant={(perfil?.estado_laboral || 'Activo') === 'Activo' ? 'success' : 'neutral'}
        />
      </Card>

      {/* Contacto */}
      <SectionTitle style={{ marginTop: S.lg }}>Contacto</SectionTitle>
      <Card>
        <InfoRow label="Teléfono" value={perfil?.telefono || '—'} />
        <InfoRow label="Email" value={perfil?.email_personal || user?.email || '—'} />
        <InfoRow label="Dirección" value={perfil?.direccion || '—'} />
        <InfoRow label="Nacionalidad" value={perfil?.nacionalidad || '—'} />
        <InfoRow label="Área" value={perfil?.area_trabajo || '—'} />
      </Card>

      {/* Actividad del mes (km, horas de manejo, horas noche, partes) */}
      <SectionTitle style={{ marginTop: S.lg }}>Actividad del mes</SectionTitle>
      <View style={styles.statsRow}>
        <StatCard label="Km del mes" value={`${resumen?.km ?? 0} km`} icon={Route} color={C.info} style={{ flex: 1 }} />
        <StatCard label="Horas de manejo" value={horasLabel(resumen?.oreTotal ?? 0)} icon={Clock} color={C.primary} style={{ flex: 1 }} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Horas noche" value={horasLabel(resumen?.oreSera ?? 0)} icon={Moon} color={C.accent} style={{ flex: 1 }} />
        <StatCard label="Partes" value={resumen?.totalPartes ?? 0} icon={ClipboardList} color={C.success} style={{ flex: 1 }} />
      </View>

      {/* Documentos con vencimiento */}
      <SectionTitle style={{ marginTop: S.lg }}>Mis documentos</SectionTitle>
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="Sin documentos registrados" subtitle="La empresa aún no registró tus documentos." />
      ) : (
        docs.map((d) => {
          const b = vencimientoBadge(d.venc);
          return (
            <Card key={d.label} style={styles.docRow}>
              <View style={[styles.docIcon, { backgroundColor: C.primary + '1A' }]}>
                <BadgeCheck size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.docLabel}>{d.label}</Text>
                <Text style={styles.docValue} numberOfLines={1}>
                  {[d.numero, d.venc ? `vence ${fmtFecha(d.venc)}` : null].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              {b && <Badge label={b.label} variant={b.variant} />}
            </Card>
          );
        })
      )}

      {/* Archivos adjuntos (fotos/PDFs subidos por la empresa) */}
      {archivos.length > 0 && (
        <>
          <SectionTitle style={{ marginTop: S.lg }}>Archivos adjuntos</SectionTitle>
          {archivos.map((a) => (
            <TouchableOpacity key={a.id} activeOpacity={0.7} onPress={() => Linking.openURL(a.url)}>
              <Card style={styles.docRow}>
                <View style={[styles.docIcon, { backgroundColor: C.info + '1A' }]}>
                  <FileText size={18} color={C.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel} numberOfLines={1}>{a.nombre || a.tipo || 'Documento'}</Text>
                  {!!a.fecha_vencimiento && (
                    <Text style={styles.docValue}>vence {fmtFecha(a.fecha_vencimiento)}</Text>
                  )}
                </View>
                <ExternalLink size={16} color={C.textFaint} />
              </Card>
            </TouchableOpacity>
          ))}
        </>
      )}
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: S.md },
  photo: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.surfaceAlt },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  name: { fontSize: F.size.lg, fontWeight: '700', color: C.text },
  cargo: { fontSize: F.size.sm, color: C.textMuted, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.sm },
  docIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docLabel: { fontSize: F.size.md, fontWeight: '600', color: C.text },
  docValue: { fontSize: F.size.sm, color: C.textMuted, marginTop: 1 },
});
