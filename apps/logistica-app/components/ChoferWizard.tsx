import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  X, ChevronLeft, ChevronRight, Check, Package, FileText, MapPin, Flag, Plus, Trash2, Navigation, Truck, User, Clock, Smartphone, Play, CornerUpLeft, Coffee, AlarmClock,
} from 'lucide-react-native';
import { Theme } from './ui';
import Select from './Select';
import ImageUpload from './ImageUpload';
import MultiFileUpload from './MultiFileUpload';
import MapboxWebView from './MapboxWebView';
import api, { DEVICE_TOKEN_KEY } from '../services/api';
import { startTracking, stopTracking } from '../services/LocationService';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../constants/currency';
import { etaInfo } from '../constants/eta';
import { CONSEGNA_ACTIONS, RETIRO_PRESETS, GASTO_TIPOS, isCoords } from '../constants/operaciones';
import type { Programacion } from '../types';

const C = Theme.colors;
const S = Theme.spacing;

const parseNum = (s: string): number => { const n = Number((s || '').trim().replace(',', '.')); return isNaN(n) ? 0 : n; };

type GastoRow = { tipo: string; monto: string; descripcion: string; numero_mancato: string; comprobantes: string[] };
interface FormState { estado_consegna: string; foto_bolla: string; anticipo: string; gastos: GastoRow[]; lugar_retiro: string; lugar_entrega: string; destinos: string[]; }
const emptyForm = (): FormState => ({ estado_consegna: '', foto_bolla: '', anticipo: '', gastos: [], lugar_retiro: '', lugar_entrega: '', destinos: [] });

const PREP_STEPS = [
  { title: 'Consegna', Icon: Package },
  { title: 'Bolla', Icon: FileText },
  { title: 'Direcciones', Icon: MapPin },
];
const ESTADO_LABEL: Record<string, string> = { EN_RUTA_IDA: 'En ruta al destino', EN_DESTINO: 'En el destino', EN_RUTA_VUELTA: 'Regresando al origen' };

interface Props { visible: boolean; operacion: Programacion | null; onClose: () => void; onSaved: () => void; }

/**
 * Flujo completo de la consegna para el chofer (inspirado en DHL): ver la consegna,
 * subir la bolla, confirmar direcciones e INICIAR RUTA (rastreo) — y en la misma
 * pantalla: llegué al destino → regresar/descanso → finalizar con peajes/gastos.
 * Si la app se cierra durante el viaje, al reabrir retoma la fase correcta.
 */
export default function ChoferWizard({ visible, operacion, onClose, onSaved }: Props) {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const { user } = useAuth();
  const moneda = user?.moneda;

  const [phase, setPhase] = useState<'prep' | 'tracking'>('prep');
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recorrido, setRecorrido] = useState<any | null>(null);
  const [fullOp, setFullOp] = useState<Programacion | null>(null);
  const [showRendicion, setShowRendicion] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const op = fullOp || operacion;

  const loadRecorrido = async (): Promise<any | null> => {
    try {
      const { data } = await api.get('/recorridos/mio/activo');
      if (data && data.id && data.programacion_id === operacion?.id) { setRecorrido(data); return data; }
      setRecorrido(null); return null;
    } catch { setRecorrido(null); return null; }
  };

  useEffect(() => {
    if (!visible || !operacion?.id) return;
    setLoaded(false); setStep(0); setShowRendicion(false);
    const populate = (src: any) => setForm({
      estado_consegna: src.estado_consegna || '',
      foto_bolla: src.foto_bolla || '',
      anticipo: src.anticipo != null ? String(src.anticipo) : '',
      gastos: Array.isArray(src.gastos) ? src.gastos.map((g: any) => ({
        tipo: g.tipo || 'OTRO', monto: g.monto != null ? String(g.monto) : '',
        descripcion: g.descripcion || '', numero_mancato: g.numero_mancato || '',
        comprobantes: Array.isArray(g.comprobantes) ? g.comprobantes : [],
      })) : [],
      lugar_retiro: src.lugar_retiro || '', lugar_entrega: src.lugar_entrega || '',
      destinos: Array.isArray(src.destinos) ? src.destinos : [],
    });
    populate(operacion);
    setFullOp(operacion);
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/programacion/${operacion.id}`);
        if (!cancelled && res.data) { populate({ ...operacion, ...res.data }); setFullOp({ ...operacion, ...res.data }); }
      } catch { }
      const rec = await loadRecorrido();
      if (cancelled) return;
      setPhase(rec ? 'tracking' : 'prep');
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [visible, operacion?.id]);

  // --- Gastos ---
  const addGasto = () => setForm((f) => ({ ...f, gastos: [...f.gastos, { tipo: 'PEAJE', monto: '', descripcion: '', numero_mancato: '', comprobantes: [] }] }));
  const updateGasto = (i: number, patch: Partial<GastoRow>) => setForm((f) => ({ ...f, gastos: f.gastos.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) }));
  const removeGasto = (i: number) => setForm((f) => ({ ...f, gastos: f.gastos.filter((_, idx) => idx !== i) }));
  const totalGastos = form.gastos.reduce((s, g) => s + parseNum(g.monto), 0);
  const anticipoNum = parseNum(form.anticipo);
  const saldo = anticipoNum - totalGastos;

  // --- Destinos ---
  const addDestino = () => setForm((f) => ({ ...f, destinos: [...f.destinos, ''] }));
  const updateDestino = (i: number, val: string) => setForm((f) => ({ ...f, destinos: f.destinos.map((d, idx) => (idx === i ? val : d)) }));
  const removeDestino = (i: number) => setForm((f) => ({ ...f, destinos: f.destinos.filter((_, idx) => idx !== i) }));

  const usarPosicionActual = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos tu ubicación.'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setForm((f) => ({ ...f, lugar_retiro: pos.coords.latitude + ',' + pos.coords.longitude }));
    } catch { Alert.alert('Ubicación no disponible', 'Activa el GPS e inténtalo de nuevo.'); }
  };

  const guardarDatos = () => api.patch(`/programacion/${operacion!.id}`, {
    estado_consegna: form.estado_consegna || null,
    foto_bolla: form.foto_bolla || null,
    lugar_retiro: form.lugar_retiro || null,
    lugar_entrega: form.lugar_entrega || null,
    destinos: form.destinos.map((s) => s.trim()).filter(Boolean),
  });

  const ensureDeviceToken = async () => {
    try {
      const res = await api.get('/gps/mi-dispositivo');
      if (res.data?.trackable && res.data?.token) { await AsyncStorage.setItem(DEVICE_TOKEN_KEY, res.data.token); return true; }
    } catch { }
    return false;
  };

  const iniciarRuta = async () => {
    if (!operacion?.id) return;
    setBusy(true);
    try {
      await guardarDatos();
      const trackable = await ensureDeviceToken();
      await api.post('/recorridos/iniciar', { programacionId: operacion.id });
      if (trackable) { try { await startTracking(); } catch { } }
      else Alert.alert('Ruta iniciada · sin GPS', 'Tu cuenta no está habilitada para rastreo. Pide al administrador que active «Será rastreado» en tu ficha.');
      await loadRecorrido();
      setPhase('tracking');
    } catch (e: any) {
      Alert.alert('No se pudo iniciar', e?.response?.data?.message || 'Inténtalo de nuevo.');
    } finally { setBusy(false); }
  };

  const accion = async (path: string, opts?: { stop?: boolean }) => {
    if (!recorrido) return;
    setBusy(true);
    try {
      await api.post(`/recorridos/${recorrido.id}/${path}`);
      if (opts?.stop) await stopTracking();
      await loadRecorrido();
    } catch (e: any) { Alert.alert('Error', e?.response?.data?.message || 'No se pudo actualizar.'); }
    finally { setBusy(false); }
  };

  const confirmCancelar = () => Alert.alert('Cancelar recorrido', '¿Seguro que quieres cancelar este traslado?', [
    { text: 'No', style: 'cancel' }, { text: 'Sí, cancelar', style: 'destructive', onPress: () => accion('cancelar', { stop: true }).then(() => onSaved()) },
  ]);

  const finalizarConsegna = async () => {
    if (!operacion?.id || !recorrido) return;
    setBusy(true);
    try {
      await api.patch(`/programacion/${operacion.id}`, {
        estado_consegna: 'CONSEGNATO',
        anticipo: form.anticipo !== '' ? parseNum(form.anticipo) : null,
        gastos: form.gastos
          .filter((g) => g.tipo && (g.monto !== '' || g.comprobantes.length || g.descripcion || g.numero_mancato))
          .map((g) => ({ tipo: g.tipo, monto: g.monto !== '' ? parseNum(g.monto) : 0, descripcion: g.descripcion || null, numero_mancato: g.tipo === 'PEAJE' ? (g.numero_mancato || null) : null, comprobantes: g.comprobantes })),
      });
      await api.post(`/recorridos/${recorrido.id}/finalizar`);
      await stopTracking();
      onSaved();
    } catch (e: any) { Alert.alert('Error', e?.response?.data?.message || 'No se pudo finalizar.'); }
    finally { setBusy(false); }
  };

  // Finalizar no exige rendición, pero si el chofer no registró ningún gasto le
  // pedimos confirmación explícita (evita cerrar la consegna sin querer).
  const handleFinalizar = () => {
    const hayGastos = form.gastos.some((g) => g.monto !== '' || g.comprobantes.length > 0 || g.descripcion || g.numero_mancato);
    if (!hayGastos) {
      Alert.alert(
        'Finalizar sin rendición',
        'No registraste ningún peaje ni gasto de este trayecto. ¿Seguro que quieres finalizar sin rendición de gastos?',
        [
          { text: 'Volver', style: 'cancel' },
          { text: 'Sí, finalizar', style: 'destructive', onPress: () => { void finalizarConsegna(); } },
        ],
      );
      return;
    }
    void finalizarConsegna();
  };

  const stops = [form.lugar_entrega, ...form.destinos].map((s) => (s || '').trim()).filter(Boolean);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle} numberOfLines={1}>{op?.cliente || 'Consegna'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><X size={24} color={C.textMuted} /></TouchableOpacity>
          </View>
          {phase === 'prep' && (
            <View style={styles.stepper}>
              {PREP_STEPS.map((s, i) => {
                const active = i === step; const done = i < step;
                return (
                  <React.Fragment key={i}>
                    <View style={styles.stepItem}>
                      <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                        {done ? <Check size={14} color="#fff" /> : <s.Icon size={14} color={active ? '#fff' : C.textFaint} />}
                      </View>
                      <Text style={[styles.stepLabel, active && { color: C.text, fontWeight: '700' }]} numberOfLines={1}>{s.title}</Text>
                    </View>
                    {i < PREP_STEPS.length - 1 && <View style={[styles.stepBar, done && { backgroundColor: C.success }]} />}
                  </React.Fragment>
                );
              })}
            </View>
          )}
        </View>

        {!loaded ? (
          <View style={styles.loading}><ActivityIndicator color={C.primary} /></View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

              {/* ETA = hora límite de entrega + contador (visible en todo el flujo). */}
              {(() => {
                const eta = etaInfo(op?.fecha_entrega);
                if (!eta) return null;
                return (
                  <View style={[styles.etaBanner, { backgroundColor: eta.color + '14', borderColor: eta.color + '55' }]}>
                    <AlarmClock size={20} color={eta.color} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.etaTitle, { color: eta.color }]}>ETA · entrega máx {eta.deadline}</Text>
                      <Text style={[styles.etaSub, { color: eta.color }]}>{eta.countdown}</Text>
                    </View>
                  </View>
                );
              })()}

              {/* ===================== FASE PREPARACIÓN ===================== */}
              {phase === 'prep' && step === 0 && (
                <View>
                  <Text style={styles.stepHeading}>Datos de la consegna</Text>
                  <View style={styles.card}>
                    <Row icon={User} label="Cliente" value={op?.cliente} />
                    <Row icon={Truck} label="Vehículo" value={op?.vehiculo_id} />
                    <Row icon={Smartphone} label="App" value={op?.app} />
                    <Row icon={MapPin} label="Ciudad" value={op?.ciudad} />
                    <Row icon={Clock} label="Attesa" value={op?.attesa} />
                    {!!op?.otros_datos && (<View style={styles.notaBox}><Text style={styles.notaLabel}>Otros datos (WhatsApp)</Text><Text style={styles.notaText}>{op.otros_datos}</Text></View>)}
                    {!!op?.nota && (<View style={styles.notaBox}><Text style={styles.notaLabel}>Nota</Text><Text style={styles.notaText}>{op.nota}</Text></View>)}
                  </View>
                  <View style={styles.sectionRow}><Flag size={18} color={C.info} /><Text style={styles.sectionTitle}>Estado de la consegna</Text></View>
                  <View style={styles.chipsWrap}>
                    {CONSEGNA_ACTIONS.map(({ value, label, Icon }) => {
                      const active = form.estado_consegna === value;
                      return (
                        <TouchableOpacity key={value} style={[styles.estadoChip, active && styles.estadoChipActive]} onPress={() => setForm({ ...form, estado_consegna: active ? '' : value })} activeOpacity={0.7}>
                          <Icon size={16} color={active ? '#fff' : C.textMuted} /><Text style={[styles.estadoChipText, active && { color: '#fff' }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {phase === 'prep' && step === 1 && (
                <View>
                  <Text style={styles.stepHeading}>Foto de la bolla (DDT)</Text>
                  <ImageUpload value={form.foto_bolla} onChange={(url) => setForm({ ...form, foto_bolla: url })} onClear={() => setForm({ ...form, foto_bolla: '' })} label="Subir foto de la bolla" variant="wide" />
                  <Text style={styles.hint}>Los gastos (peajes/combustible) se registran al final, cuando termines la ruta.</Text>
                </View>
              )}

              {phase === 'prep' && step === 2 && (
                <View>
                  <Text style={styles.stepHeading}>Origen (retiro)</Text>
                  <View style={styles.chipsWrap}>
                    {RETIRO_PRESETS.map((p) => (
                      <TouchableOpacity key={p.value} style={styles.presetChip} onPress={() => setForm({ ...form, lugar_retiro: p.value })} activeOpacity={0.7}>
                        <MapPin size={14} color={C.info} /><Text style={styles.presetChipText}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.presetChip} onPress={usarPosicionActual} activeOpacity={0.7}>
                      <Navigation size={14} color={C.success} /><Text style={styles.presetChipText}>Posición actual</Text>
                    </TouchableOpacity>
                  </View>
                  <TextField value={form.lugar_retiro} onChangeText={() => { }} placeholder="Elige el origen arriba" editable={false} styles={styles} />
                  {isCoords(form.lugar_retiro) && <Text style={styles.gpsHint}>📍 Posición actual (GPS)</Text>}

                  <Text style={styles.stepHeading}>Destino(s)</Text>
                  <TextField value={form.lugar_entrega} onChangeText={(t) => setForm({ ...form, lugar_entrega: t })} placeholder="Dirección de entrega" styles={styles} />
                  {form.destinos.map((d, i) => (
                    <View key={i} style={styles.destinoRow}>
                      <View style={{ flex: 1 }}><TextField value={d} onChangeText={(t) => updateDestino(i, t)} placeholder={`Destino adicional ${i + 1}`} styles={styles} /></View>
                      <TouchableOpacity onPress={() => removeDestino(i)} style={styles.destinoRemove}><Trash2 size={16} color={C.danger} /></TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={addDestino} activeOpacity={0.7}><Plus size={16} color={C.textMuted} /><Text style={styles.addText}>Agregar destino</Text></TouchableOpacity>

                  {(form.lugar_retiro && stops.length > 0) && (
                    <>
                      <Text style={styles.stepHeading}>Ruta</Text>
                      <MapboxWebView style={styles.map} mapStyle="streets" route={{ originAddress: form.lugar_retiro, destinationAddress: stops[stops.length - 1], waypoints: stops.slice(0, -1) }} fit />
                    </>
                  )}
                </View>
              )}

              {/* ===================== FASE EN RUTA (rastreo) ===================== */}
              {phase === 'tracking' && recorrido && !showRendicion && (
                <View>
                  <View style={[styles.trackCard, recorrido.descanso_desde && { borderColor: C.warning }]}>
                    <View style={styles.trackHeaderRow}>
                      <Navigation size={18} color={C.primary} />
                      <Text style={styles.trackTitle}>{recorrido.descanso_desde ? 'En descanso' : (ESTADO_LABEL[recorrido.estado] || recorrido.estado)}</Text>
                    </View>
                    <Row icon={MapPin} label="Origen" value={recorrido.origen_label || op?.lugar_retiro} />
                    <Row icon={Flag} label="Destino" value={recorrido.destino_label || op?.lugar_entrega} />
                    <Text style={styles.shareNote}>Tu ubicación se comparte con la central mientras la ruta está activa.</Text>
                  </View>

                  {recorrido.descanso_desde ? (
                    <>
                      <BigBtn label="Reanudar ruta" Icon={Play} onPress={() => accion('reanudar')} disabled={busy} />
                      <BigBtn label="Cancelar traslado" Icon={X} variant="ghost" onPress={confirmCancelar} disabled={busy} styles={styles} />
                    </>
                  ) : (
                    <>
                      {recorrido.estado === 'EN_RUTA_IDA' && <BigBtn label="Llegué al destino" Icon={Flag} onPress={() => accion('llegada')} disabled={busy} />}
                      {recorrido.estado === 'EN_DESTINO' && (<>
                        <BigBtn label="Regresar al origen" Icon={CornerUpLeft} onPress={() => accion('regreso')} disabled={busy} variant="secondary" styles={styles} />
                        <BigBtn label="Finalizar consegna" Icon={Check} onPress={() => setShowRendicion(true)} disabled={busy} />
                      </>)}
                      {recorrido.estado === 'EN_RUTA_VUELTA' && <BigBtn label="Finalizar consegna" Icon={Check} onPress={() => setShowRendicion(true)} disabled={busy} />}
                      {(recorrido.estado === 'EN_RUTA_IDA' || recorrido.estado === 'EN_RUTA_VUELTA') && <BigBtn label="Tomar descanso" Icon={Coffee} onPress={() => accion('descanso')} disabled={busy} variant="secondary" styles={styles} />}
                      {recorrido.estado === 'EN_RUTA_IDA' && <BigBtn label="Cancelar traslado" Icon={X} variant="ghost" onPress={confirmCancelar} disabled={busy} styles={styles} />}
                    </>
                  )}
                </View>
              )}

              {/* ===================== RENDICIÓN (al finalizar) ===================== */}
              {phase === 'tracking' && recorrido && showRendicion && (
                <View>
                  <Text style={styles.stepHeading}>Peajes y gastos del trayecto</Text>
                  <Text style={styles.fieldLabel}>Anticipo recibido ({moneda || 'EUR'})</Text>
                  <TextField value={form.anticipo} onChangeText={(t) => setForm({ ...form, anticipo: t })} placeholder="0.00" keyboardType="numeric" styles={styles} />
                  {form.gastos.map((g, i) => (
                    <View key={i} style={styles.gastoCard}>
                      <Select label="Tipo" value={g.tipo} onChange={(v) => updateGasto(i, { tipo: v })} options={GASTO_TIPOS} searchable={false} />
                      <Text style={styles.fieldLabel}>Monto ({moneda || 'EUR'})</Text>
                      <TextField value={g.monto} onChangeText={(t) => updateGasto(i, { monto: t })} placeholder="0.00" keyboardType="numeric" styles={styles} />
                      {g.tipo === 'OTRO' && (<><Text style={styles.fieldLabel}>Descripción</Text><TextField value={g.descripcion} onChangeText={(t) => updateGasto(i, { descripcion: t })} placeholder="¿En qué se gastó?" styles={styles} /></>)}
                      {g.tipo === 'PEAJE' && (<><Text style={styles.fieldLabel}>Nº de mancato</Text><TextField value={g.numero_mancato} onChangeText={(t) => updateGasto(i, { numero_mancato: t })} placeholder="Número de mancato" styles={styles} /></>)}
                      <Text style={styles.fieldLabel}>Comprobante(s)</Text>
                      <MultiFileUpload value={g.comprobantes} onChange={(urls) => updateGasto(i, { comprobantes: urls })} />
                      <TouchableOpacity style={styles.removeRow} onPress={() => removeGasto(i)}><Trash2 size={14} color={C.danger} /><Text style={styles.removeText}>Quitar gasto</Text></TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={addGasto} activeOpacity={0.7}><Plus size={16} color={C.textMuted} /><Text style={styles.addText}>Agregar gasto</Text></TouchableOpacity>
                  <View style={styles.saldoBox}>
                    <View style={styles.saldoRow}><Text style={styles.saldoLabel}>Anticipo</Text><Text style={styles.saldoVal}>{formatMoney(anticipoNum, moneda)}</Text></View>
                    <View style={styles.saldoRow}><Text style={styles.saldoLabel}>Total gastado</Text><Text style={styles.saldoVal}>− {formatMoney(totalGastos, moneda)}</Text></View>
                    <View style={[styles.saldoRow, styles.saldoTotal]}>
                      <Text style={[styles.saldoLabel, { fontWeight: '700', color: saldo < 0 ? C.danger : C.success }]}>{saldo < 0 ? 'Excedido (falta)' : 'A devolver'}</Text>
                      <Text style={[styles.saldoVal, { fontWeight: '700', color: saldo < 0 ? C.danger : C.success }]}>{formatMoney(Math.abs(saldo), moneda)}</Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* Footer */}
        {loaded && phase === 'prep' && (
          <View style={styles.footer}>
            {step > 0 ? (
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)} activeOpacity={0.7}><ChevronLeft size={20} color={C.text} /><Text style={styles.backText}>Atrás</Text></TouchableOpacity>
            ) : <View style={{ flex: 1 }} />}
            {step < PREP_STEPS.length - 1 ? (
              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep((s) => s + 1)} activeOpacity={0.85}><Text style={styles.nextText}>Siguiente</Text><ChevronRight size={20} color="#fff" /></TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.nextBtn, { backgroundColor: C.success }, busy && { opacity: 0.6 }]} disabled={busy} onPress={iniciarRuta} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Play size={20} color="#fff" />}<Text style={styles.nextText}>Iniciar ruta</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {loaded && phase === 'tracking' && showRendicion && (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowRendicion(false)} activeOpacity={0.7}><ChevronLeft size={20} color={C.text} /><Text style={styles.backText}>Atrás</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: C.success }, busy && { opacity: 0.6 }]} disabled={busy} onPress={handleFinalizar} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Check size={20} color="#fff" />}<Text style={styles.nextText}>Finalizar consegna</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  if (!value) return null;
  return (<View style={styles.infoRow}><Icon size={15} color={C.textFaint} /><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={2}>{value}</Text></View>);
}

function TextField({ value, onChangeText, placeholder, keyboardType, editable = true, styles }: { value: string; onChangeText: (t: string) => void; placeholder?: string; keyboardType?: 'default' | 'numeric'; editable?: boolean; styles: any }) {
  return (<TextInput style={[styles.input, !editable && { opacity: 0.6 }]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.textFaint} keyboardType={keyboardType} editable={editable} />);
}

// Botón grande de acción de ruta.
function BigBtn({ label, Icon, onPress, disabled, variant = 'primary', styles: st }: { label: string; Icon: any; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'ghost'; styles?: any }) {
  const { themeKey } = useTheme();
  const own = useMemo(() => makeStyles(), [themeKey]);
  const styles = st || own;
  const bg = variant === 'primary' ? C.primary : variant === 'secondary' ? C.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? '#fff' : variant === 'ghost' ? C.textMuted : C.text;
  return (
    <TouchableOpacity style={[styles.bigBtn, { backgroundColor: bg, borderWidth: variant === 'primary' ? 0 : 1, borderColor: C.border }, disabled && { opacity: 0.5 }]} disabled={disabled} onPress={onPress} activeOpacity={0.85}>
      <Icon size={18} color={fg} /><Text style={[styles.bigBtnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, backgroundColor: C.surface },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: C.text, marginRight: S.md },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { alignItems: 'center', width: 90 },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepDotActive: { backgroundColor: C.info, borderColor: C.info },
  stepDotDone: { backgroundColor: C.success, borderColor: C.success },
  stepLabel: { fontSize: 11, color: C.textFaint, textAlign: 'center' },
  stepBar: { flex: 1, height: 2, backgroundColor: C.border, marginBottom: 18 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepHeading: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: S.md, marginBottom: S.sm },
  etaBanner: { flexDirection: 'row', alignItems: 'center', gap: S.sm, borderWidth: 1, borderRadius: Theme.radius.md, paddingHorizontal: S.md, paddingVertical: S.sm, marginBottom: S.sm },
  etaTitle: { fontSize: 14, fontWeight: '800' },
  etaSub: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  hint: { fontSize: 13, color: C.textMuted, marginTop: S.md },
  card: { backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  infoLabel: { fontSize: 13, color: C.textMuted, width: 80 },
  infoValue: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text, textAlign: 'right' },
  notaBox: { marginTop: S.sm, backgroundColor: C.surfaceAlt, borderRadius: Theme.radius.md, padding: S.sm },
  notaLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', marginBottom: 2 },
  notaText: { fontSize: 14, color: C.text },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: S.lg, marginBottom: S.sm },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm },
  estadoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, paddingVertical: 11, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  estadoChipActive: { backgroundColor: C.info, borderColor: C.info },
  estadoChipText: { fontSize: 14, fontWeight: '700', color: C.textMuted },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, paddingVertical: 10, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  presetChipText: { fontSize: 13, fontWeight: '600', color: C.text },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.textMuted, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: Theme.radius.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: Theme.font.size.md, color: C.text, marginBottom: S.sm },
  gpsHint: { fontSize: 12, color: C.success, marginTop: -4, marginBottom: S.sm },
  gastoCard: { backgroundColor: C.surfaceAlt, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.sm },
  removeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
  removeText: { fontSize: 12, fontWeight: '600', color: C.danger },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Theme.radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderStrong, marginBottom: S.sm },
  addText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  saldoBox: { backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: 6, marginTop: S.sm },
  saldoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saldoTotal: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 6, marginTop: 2 },
  saldoLabel: { fontSize: 14, color: C.textMuted },
  saldoVal: { fontSize: 14, color: C.text },
  destinoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: S.sm },
  destinoRemove: { padding: 10, marginTop: 2 },
  map: { height: 240, borderRadius: Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: S.md },
  trackCard: { backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.md },
  trackHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: S.sm },
  trackTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  shareNote: { fontSize: 12, color: C.textMuted, marginTop: S.sm },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: Theme.radius.md, marginBottom: S.sm },
  bigBtnText: { fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.surface },
  backBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  backText: { fontSize: 15, fontWeight: '700', color: C.text },
  nextBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: Theme.radius.md, backgroundColor: C.primary },
  nextText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
