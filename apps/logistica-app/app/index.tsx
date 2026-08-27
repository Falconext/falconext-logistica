import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';

const C = Theme.colors;

export default function LoginScreen() {
  const router = useRouter();
  const { themeKey } = useTheme();
  const styles = useMemo(() => makeStyles(), [themeKey]);
  const { loginUser, isLoading, mode } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Si ya hay sesión activa, saltar directo.
  useEffect(() => {
    if (isLoading) return;
    if (mode === 'user') router.replace('/(app)/dashboard' as any);
  }, [isLoading, mode]);

  const handleUserLogin = async () => {
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // Recortamos la contraseña: el autorrelleno de iOS/Android suele agregar
      // espacios invisibles al inicio/final que rompen el bcrypt.compare del backend.
      await loginUser(email.trim().toLowerCase(), password.trim());
    } catch (err: any) {
      // Distinguimos credenciales incorrectas (401 real del backend) de un fallo
      // de conexión (sin respuesta): antes ambos mostraban el mismo mensaje y
      // confundían un problema de red con uno de contraseña.
      if (err?.response?.status === 401) {
        setError('Correo o contraseña incorrectos');
      } else if (err?.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('No se pudo conectar con el servidor. Revisa tu internet e inténtalo de nuevo.');
      }
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
          <Image
            source={require('../assets/images/logo-mark.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>GAMONAL DRIVER</Text>
          <Text style={styles.subtitle}>Gestión de flota y operaciones</Text>
        </View>

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
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <EyeOff size={20} color={C.textFaint} />
              ) : (
                <Eye size={20} color={C.textFaint} />
              )}
            </TouchableOpacity>
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
      </View>

      <Text style={styles.footer}>v1.0.0 • Gamonal Driver</Text>
    </KeyboardAvoidingView>
  );
}

const makeStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 24 },
  content: { flex: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 16,
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
