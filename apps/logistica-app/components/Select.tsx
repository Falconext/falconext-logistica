import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable, TextInput, FlatList } from 'react-native';
import { ChevronDown, Check, Search, X } from 'lucide-react-native';
import { Theme } from '../constants/theme';

const C = Theme.colors;
const S = Theme.spacing;

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value?: string | null;
  onChange: (v: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  searchable?: boolean;
}

/** Select móvil buscable (modal con lista filtrable). Contrato: value/onChange(value). */
export default function Select({ value, onChange, options, label, placeholder = 'Seleccionar...', searchable = true }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const openModal = () => { setQuery(''); setOpen(true); };
  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <View style={{ marginBottom: S.md }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.trigger} onPress={openModal} activeOpacity={0.7}>
        <Text style={[styles.triggerText, { color: selected ? C.text : C.textFaint }]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={16} color={C.textFaint} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{label || 'Seleccionar'}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}><X size={20} color={C.textMuted} /></TouchableOpacity>
          </View>

          {searchable && (
            <View style={styles.searchBar}>
              <Search size={16} color={C.textFaint} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar..."
                placeholderTextColor={C.textFaint}
                autoCapitalize="none"
              />
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(o, i) => o.value + i}
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>Sin resultados</Text>}
            renderItem={({ item }) => {
              const isSel = item.value === value;
              return (
                <TouchableOpacity style={styles.option} onPress={() => pick(item.value)} activeOpacity={0.7}>
                  <Text style={[styles.optionText, isSel && styles.optionSel]} numberOfLines={1}>{item.label}</Text>
                  {isSel && <Check size={18} color={C.accent} />}
                </TouchableOpacity>
              );
            }}
          />
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
  sheet: { position: 'absolute', left: S.lg, right: S.lg, top: '20%', backgroundColor: C.surface, borderRadius: Theme.radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: S.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  title: { fontSize: Theme.font.size.lg, fontWeight: '700', color: C.text },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: Theme.radius.md, paddingHorizontal: S.md, height: 44, marginBottom: S.sm },
  searchInput: { flex: 1, fontSize: Theme.font.size.md, color: C.text, paddingVertical: 0 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: S.sm, borderRadius: Theme.radius.md },
  optionText: { flex: 1, fontSize: Theme.font.size.md, color: C.text },
  optionSel: { fontWeight: '700', color: C.primary },
  empty: { textAlign: 'center', color: C.textFaint, paddingVertical: S.xl, fontSize: Theme.font.size.md },
});
