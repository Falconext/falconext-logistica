import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, X, FileText } from 'lucide-react-native';
import api from '../services/api';
import { Theme } from '../constants/theme';

const C = Theme.colors;
const S = Theme.spacing;

interface Props {
  value?: string | null;
  onChange: (url: string) => void;
  onClear?: () => void;
  label?: string;
  variant?: 'avatar' | 'wide';
}

/**
 * Sube una foto (cámara o galería) al backend (/files/upload -> Cloudinary)
 * y devuelve la URL. Equivalente móvil del FileUpload de la web.
 */
export default function ImageUpload({ value, onChange, onClear, label = 'Subir foto', variant = 'wide' }: Props) {
  const [uploading, setUploading] = useState(false);

  const upload = async (uri: string) => {
    setUploading(true);
    try {
      const name = uri.split('/').pop() || `foto_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(name);
      const type = match ? `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}` : 'image/jpeg';
      const form = new FormData();
      // @ts-ignore  — forma de archivo en React Native
      form.append('file', { uri, name, type });
      const res = await api.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onChange(res.data.url);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const pickFrom = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso para subir la imagen.');
      return;
    }
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!res.canceled && res.assets?.[0]?.uri) upload(res.assets[0].uri);
  };

  const choose = () => {
    Alert.alert(label, '¿De dónde quieres tomar la imagen?', [
      { text: 'Cámara', onPress: () => pickFrom('camera') },
      { text: 'Galería', onPress: () => pickFrom('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  if (variant === 'avatar') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        <TouchableOpacity onPress={choose} style={styles.avatar} activeOpacity={0.7}>
          {uploading ? (
            <ActivityIndicator color={C.textMuted} />
          ) : value ? (
            <Image source={{ uri: value }} style={styles.avatarImg} />
          ) : (
            <Camera size={22} color={C.textFaint} />
          )}
        </TouchableOpacity>
        <View>
          <TouchableOpacity onPress={choose}>
            <Text style={styles.link}>{value ? 'Cambiar foto' : label}</Text>
          </TouchableOpacity>
          {!!value && onClear && (
            <TouchableOpacity onPress={onClear}>
              <Text style={styles.clear}>Quitar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View>
      {value ? (
        <View style={styles.filled}>
          <Image source={{ uri: value }} style={styles.thumb} />
          <TouchableOpacity onPress={choose} style={{ flex: 1 }}>
            <Text style={styles.link}>Cambiar</Text>
          </TouchableOpacity>
          {onClear && (
            <TouchableOpacity onPress={onClear} hitSlop={8}>
              <X size={18} color={C.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TouchableOpacity onPress={choose} style={styles.dropzone} activeOpacity={0.7} disabled={uploading}>
          {uploading ? <ActivityIndicator color={C.primary} /> : <ImagePlus size={22} color={C.textFaint} />}
          <Text style={styles.dropText}>{uploading ? 'Subiendo...' : label}</Text>
          <Text style={styles.dropHint}>Cámara o galería</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  link: { color: C.primary, fontWeight: '600', fontSize: 14 },
  clear: { color: C.danger, fontSize: 12, marginTop: 4 },
  filled: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  dropzone: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: S.xl, borderRadius: Theme.radius.md, borderWidth: 2, borderColor: C.border, borderStyle: 'dashed', backgroundColor: C.surfaceAlt },
  dropText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  dropHint: { fontSize: 12, color: C.textFaint },
});
