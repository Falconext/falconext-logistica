/**
 * Kit de UI compartido de la app de logística.
 * Todos los módulos importan desde `@/components/ui` (o ruta relativa).
 * Mantener este archivo como única fuente de componentes base para lograr
 * una apariencia consistente en toda la app.
 */
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal as RNModal,
  Pressable,
  StyleProp,
  ViewStyle,
  TextStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LucideIcon, Search, X, Inbox, ChevronLeft, Bell, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Theme } from '../../constants/theme';

const C = Theme.colors;
const S = Theme.spacing;
const R = Theme.radius;
const F = Theme.font;

// ---------------------------------------------------------------------------
// Screen: contenedor de pantalla con safe-area y fondo de la app.
// ---------------------------------------------------------------------------
export function Screen({
  children,
  scroll = false,
  padded = false,
  refreshControl,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ReactElement<any>;
  style?: StyleProp<ViewStyle>;
}) {
  const inner = padded ? { padding: S.lg } : undefined;
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ paddingBottom: S.xxl }, inner]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// AppHeader: cabecera con título, subtítulo, botón atrás y acciones.
// ---------------------------------------------------------------------------
export function AppHeader({
  title,
  subtitle,
  back = false,
  right,
  showBell = false,
  onBell,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  showBell?: boolean;
  onBell?: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back && (
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={24} color={C.text} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
      {showBell && (
        <TouchableOpacity style={styles.headerIconBtn} onPress={onBell} hitSlop={8}>
          <Bell size={20} color={C.text} />
        </TouchableOpacity>
      )}
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card: superficie con sombra suave.
// ---------------------------------------------------------------------------
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// StatCard: KPI (etiqueta, valor, icono, color de acento).
// ---------------------------------------------------------------------------
export function StatCard({
  label,
  value,
  icon: Icon,
  color = C.primary,
  style,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.statCard, style]}>
      {Icon && (
        <View style={[styles.statIcon, { backgroundColor: color + '1A' }]}>
          <Icon size={20} color={color} />
        </View>
      )}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Badge: pill de estado con variante semántica.
// ---------------------------------------------------------------------------
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const badgeColors: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: C.successSoft, fg: C.success },
  warning: { bg: C.warningSoft, fg: C.warning },
  danger: { bg: C.dangerSoft, fg: C.danger },
  info: { bg: C.infoSoft, fg: C.info },
  neutral: { bg: C.neutralSoft, fg: C.neutral },
};

export function Badge({ label, variant = 'neutral' }: { label: string; variant?: BadgeVariant }) {
  const c = badgeColors[variant];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SearchBar
// ---------------------------------------------------------------------------
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Buscar...',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchBar}>
      <Search size={18} color={C.textFaint} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
          <X size={18} color={C.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Button: primary | secondary | ghost | danger
// ---------------------------------------------------------------------------
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon: Icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, { backgroundColor: v.bg, borderColor: v.border }, (disabled || loading) && { opacity: 0.5 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {Icon && <Icon size={18} color={v.fg} />}
          <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const buttonVariants = {
  primary: { bg: C.primary, fg: C.textOnPrimary, border: C.primary },
  secondary: { bg: C.surface, fg: C.text, border: C.border },
  ghost: { bg: 'transparent', fg: C.primary, border: 'transparent' },
  danger: { bg: C.danger, fg: '#fff', border: C.danger },
};

// ---------------------------------------------------------------------------
// FloatingButton (FAB) para crear
// ---------------------------------------------------------------------------
export function Fab({ onPress, icon: Icon = Plus }: { onPress?: () => void; icon?: LucideIcon }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Icon size={24} color="#fff" />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// FormField: input etiquetado para formularios.
// ---------------------------------------------------------------------------
export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  multiline,
  autoCapitalize,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginBottom: S.md }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && { height: 88, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// EmptyState / LoadingState / ErrorState
// ---------------------------------------------------------------------------
export function LoadingState({ text = 'Cargando...' }: { text?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={styles.centeredText}>{text}</Text>
    </View>
  );
}

export function EmptyState({
  title = 'Sin datos',
  subtitle,
  icon: Icon = Inbox,
}: {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  return (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}>
        <Icon size={32} color={C.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.centeredText}>{subtitle}</Text>}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>Ocurrió un error</Text>
      <Text style={styles.centeredText}>{message || 'No se pudo cargar la información.'}</Text>
      {onRetry && <Button title="Reintentar" onPress={onRetry} variant="secondary" style={{ marginTop: S.md }} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// FormModal: hoja modal inferior para formularios de crear/editar.
// ---------------------------------------------------------------------------
export function FormModal({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <RNModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSheet}
      >
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <X size={22} color={C.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: S.lg }}>
          {children}
        </ScrollView>
        {footer && <View style={styles.modalFooter}>{footer}</View>}
      </KeyboardAvoidingView>
    </RNModal>
  );
}

// ---------------------------------------------------------------------------
// InfoRow: fila etiqueta/valor para detalles.
// ---------------------------------------------------------------------------
export function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value ?? '—'}</Text>
    </View>
  );
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

// Re-export de iconos comunes para conveniencia de los módulos.
export { Theme } from '../../constants/theme';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerBack: { padding: 2 },
  headerTitle: { fontSize: F.size.xl, fontWeight: F.weight.bold, color: C.text },
  headerSubtitle: { fontSize: F.size.sm, color: C.textMuted, marginTop: 1 },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: R.full,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: S.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Theme.shadow.card,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: S.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Theme.shadow.card,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: S.sm,
  },
  statValue: { fontSize: F.size.xxl, fontWeight: F.weight.bold, color: C.text },
  statLabel: { fontSize: F.size.sm, color: C.textMuted, marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: S.sm, paddingVertical: 3, borderRadius: R.full },
  badgeText: { fontSize: F.size.xs, fontWeight: F.weight.semibold },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: F.size.md, color: C.text, paddingVertical: 0 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
    height: 48,
    borderRadius: R.md,
    borderWidth: 1,
    paddingHorizontal: S.lg,
  },
  buttonText: { fontSize: F.size.md, fontWeight: F.weight.semibold },
  fab: {
    position: 'absolute',
    right: S.lg,
    bottom: S.xl,
    width: 56,
    height: 56,
    borderRadius: R.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.floating,
  },
  fieldLabel: { fontSize: F.size.sm, fontWeight: F.weight.medium, color: C.textMuted, marginBottom: 6 },
  fieldInput: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    fontSize: F.size.md,
    color: C.text,
  },
  centered: { alignItems: 'center', justifyContent: 'center', padding: S.xxl, gap: S.sm, flexGrow: 1 },
  centeredText: { fontSize: F.size.md, color: C.textMuted, textAlign: 'center' },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: R.full,
    backgroundColor: C.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: S.sm,
  },
  emptyTitle: { fontSize: F.size.lg, fontWeight: F.weight.semibold, color: C.text },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  modalSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    padding: S.lg,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: R.full,
    backgroundColor: C.border,
    marginBottom: S.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  modalTitle: { fontSize: F.size.xl, fontWeight: F.weight.bold, color: C.text },
  modalFooter: { paddingTop: S.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: S.md,
  },
  infoLabel: { fontSize: F.size.sm, color: C.textMuted },
  infoValue: { fontSize: F.size.md, color: C.text, fontWeight: F.weight.medium, flexShrink: 1, textAlign: 'right' },
  sectionTitle: { fontSize: F.size.lg, fontWeight: F.weight.bold, color: C.text, marginBottom: S.md },
});
