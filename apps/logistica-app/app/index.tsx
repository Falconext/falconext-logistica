import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Truck, Lock, User, ArrowRight, Smartphone } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Theme } from '../constants/theme';

const C = Theme.colors;

type Tab = 'user' | 'device';

export default function LoginScreen() {
  const router = useRouter();
  const { loginUser, loginDevice, isLoading, mode } = useAuth();
  const [tab, setTab] = useState<Tab>('user');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceTok, setDeviceTok] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Si ya hay sesión activa, saltar directo.
  useEffect(() => {
    if (isLoading) return;
    if (mode === 'user') router.replace('/(app)/dashboard' as any);
    else if (mode === 'device') router.replace('/conductor' as any);
  }, [isLoading, mode]);

  const handleUserLogin = async () => {
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await loginUser(email.trim(), password);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Correo o contraseña incorrectos');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeviceLogin = async () => {
    if (!deviceTok.trim()) {
      setError('Ingresa el token del dispositivo');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await loginDevice(deviceTok.trim());
    } catch (err: any) {
      setError(err?.message || 'Token inválido');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Truck size={32} color="#fff" />
          </View>
          <Text style={styles.title}>Logística Pro</Text>
          <Text style={styles.subtitle}>Gestión de flota y operaciones</Text>
        </View>

        {/* Selector de modo */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'user' && styles.tabActive]}
            onPress={() => { setTab('user'); setError(''); }}
          >
            <User size={16} color={tab === 'user' ? C.primary : C.textMuted} />
            <Text style={[styles.tabText, tab === 'user' && styles.tabTextActive]}>Usuario</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'device' && styles.tabActive]}
            onPress={() => { setTab('device'); setError(''); }}
          >
            <Smartphone size={16} color={tab === 'device' ? C.primary : C.textMuted} />
            <Text style={[styles.tabText, tab === 'device' && styles.tabTextActive]}>Chofer</Text>
          </TouchableOpacity>
        </View>

        {tab === 'user' ? (
          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <User size={20} color={C.textFaint} />
              <TextInput
                style={styles.input}
                placeholder="Correo electrónico"
                placeholderTextColor={C.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.inputWrap}>
              <Lock size={20} color={C.textFaint} />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                placeholderTextColor={C.textFaint}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity style={styles.button} onPress={handleUserLogin} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Iniciar Sesión</Text>
                  <ArrowRight size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.hint}>
              Ingresa el token del dispositivo (lo obtiene el administrador en Dispositivos GPS) para compartir tu ubicación.
            </Text>
            <View style={styles.inputWrap}>
              <Smartphone size={20} color={C.textFaint} />
              <TextInput
                style={styles.input}
                placeholder="Token del dispositivo"
                placeholderTextColor={C.textFaint}
                autoCapitalize="none"
                value={deviceTok}
                onChangeText={setDeviceTok}
              />
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity style={styles.button} onPress={handleDeviceLogin} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Conectar</Text>
                  <ArrowRight size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.footer}>v1.0.0 • Logística Pro</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, padding: 24 },
  content: { flex: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Theme.shadow.floating,
  },
  title: { fontSize: 28, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 15, color: C.textMuted, marginTop: 4 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabActive: { backgroundColor: C.surface, ...Theme.shadow.card },
  tabText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: C.primary },
  form: { gap: 14 },
  hint: { fontSize: 13, color: C.textMuted, lineHeight: 19 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  input: { flex: 1, fontSize: 15, color: C.text },
  error: { color: C.danger, fontSize: 13, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    height: 52,
    borderRadius: 12,
    marginTop: 4,
    ...Theme.shadow.floating,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { textAlign: 'center', color: C.textFaint, fontSize: 12, paddingBottom: 8 },
});
