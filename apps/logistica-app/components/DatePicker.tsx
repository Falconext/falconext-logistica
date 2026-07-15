import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { Theme } from '../constants/theme';

const C = Theme.colors;
const S = Theme.spacing;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mondayIdx = (d: Date) => (d.getDay() + 6) % 7;

function parseISO(v?: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

interface Props {
  value?: string | null;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
}

/** DatePicker móvil (calendario en modal). Contrato igual que el nativo/web: value/onChange 'YYYY-MM-DD'. */
export default function DatePicker({ value, onChange, label, placeholder = 'Seleccionar fecha' }: Props) {
  const selected = useMemo(() => parseISO(value), [value]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => selected ?? new Date());

  const cells = useMemo(() => {
    const y = view.getFullYear(), m = view.getMonth();
    const start = new Date(y, m, 1 - mondayIdx(new Date(y, m, 1)));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, inMonth: d.getMonth() === m };
    });
  }, [view]);

  const today = new Date();
  const display = selected ? `${selected.getDate()} ${MESES_C[selected.getMonth()]} ${selected.getFullYear()}` : '';

  const openModal = () => { setView(selected ?? new Date()); setOpen(true); };
  const pick = (d: Date) => { onChange(toISO(d)); setOpen(false); };

  return (
    <View style={{ marginBottom: S.md }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.trigger} onPress={openModal} activeOpacity={0.7}>
        <Calendar size={16} color={C.textFaint} />
        <Text style={[styles.triggerText, { color: display ? C.text : C.textFaint }]}>{display || placeholder}</Text>
        {!!display && (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={8}>
            <X size={16} color={C.textFaint} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={styles.navBtn}>
              <ChevronLeft size={20} color={C.textMuted} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MESES[view.getMonth()]} {view.getFullYear()}</Text>
            <TouchableOpacity onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={styles.navBtn}>
              <ChevronRight size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {DIAS.map((d) => <Text key={d} style={styles.weekDay}>{d}</Text>)}
          </View>

          <View style={styles.grid}>
            {cells.map(({ date, inMonth }, i) => {
              const isSel = selected && sameDay(date, selected);
              const isToday = sameDay(date, today);
              return (
                <TouchableOpacity key={i} style={styles.dayCell} onPress={() => pick(date)} activeOpacity={0.7}>
                  <View style={[styles.day, isSel && styles.daySel, !isSel && isToday && styles.dayToday]}>
                    <Text style={[styles.dayText, isSel && styles.dayTextSel, !inMonth && styles.dayFaint]}>{date.getDate()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => pick(new Date())}><Text style={styles.hoy}>Hoy</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { onChange(''); setOpen(false); }}><Text style={styles.limpiar}>Limpiar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: Theme.font.size.sm, fontWeight: '500', color: C.textMuted, marginBottom: 6 },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: Theme.radius.md, paddingHorizontal: S.md, paddingVertical: 12 },
  triggerText: { flex: 1, fontSize: Theme.font.size.md },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  sheet: { position: 'absolute', left: S.lg, right: S.lg, top: '25%', backgroundColor: C.surface, borderRadius: Theme.radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.sm },
  navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: Theme.font.size.md, fontWeight: '700', color: C.text, textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: C.textFaint },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  day: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: C.accent },
  dayToday: { borderWidth: 1, borderColor: C.accent },
  dayText: { fontSize: Theme.font.size.md, color: C.text, fontWeight: '500' },
  dayTextSel: { color: '#1a1a1c', fontWeight: '700' },
  dayFaint: { color: C.textFaint },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: S.md, paddingTop: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  hoy: { fontSize: Theme.font.size.sm, fontWeight: '700', color: C.primary },
  limpiar: { fontSize: Theme.font.size.sm, color: C.textFaint },
});
