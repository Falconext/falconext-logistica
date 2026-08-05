import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { UploadCloud, X, FileText, Loader } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import api from '../services/api';

const C = Theme.colors;
const S = Theme.spacing;

interface Props {
    value: string[];
    onChange: (urls: string[]) => void;
    label?: string;
    disabled?: boolean;
}

const isPdf = (url: string) => url.toLowerCase().includes('.pdf');
const fileName = (url: string) => {
    try { return decodeURIComponent(url.split('/').pop() || 'archivo'); } catch { return 'archivo'; }
};

async function uploadAsset(asset: { uri: string; name: string; type: string }): Promise<string> {
    const form = new FormData();
    // @ts-ignore — forma de archivo en React Native
    form.append('file', { uri: asset.uri, name: asset.name, type: asset.type });
    const res = await api.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.url;
}

/** Sube uno o varios comprobantes (foto/galería/PDF) a /files/upload y mantiene la lista de URLs. */
export default function MultiFileUpload({ value, onChange, label = 'Agregar comprobante', disabled = false }: Props) {
    const { themeKey } = useTheme();
    const styles = useMemo(() => makeStyles(), [themeKey]);
    const [uploading, setUploading] = useState(false);

    const doUpload = async (asset: { uri: string; name: string; type: string }) => {
        setUploading(true);
        try {
            const url = await uploadAsset(asset);
            if (url) onChange([...(value || []), url]);
        } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message || 'No se pudo subir el archivo.');
        } finally {
            setUploading(false);
        }
    };

    const fromCamera = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos la cámara.'); return; }
        const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (!res.canceled && res.assets?.[0]) {
            const a = res.assets[0];
            doUpload({ uri: a.uri, name: a.fileName || `comprobante_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
        }
    };
    const fromLibrary = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos acceso a la galería.'); return; }
        const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
        if (!res.canceled && res.assets?.[0]) {
            const a = res.assets[0];
            doUpload({ uri: a.uri, name: a.fileName || `comprobante_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
        }
    };
    const fromDocument = async () => {
        const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
        if (!res.canceled && res.assets?.[0]) {
            const a = res.assets[0];
            doUpload({ uri: a.uri, name: a.name || `comprobante_${Date.now()}.pdf`, type: a.mimeType || 'application/pdf' });
        }
    };
    const pick = () => {
        Alert.alert('Comprobante', 'Adjuntar', [
            { text: 'Tomar foto', onPress: fromCamera },
            { text: 'Elegir de galería', onPress: fromLibrary },
            { text: 'Archivo PDF', onPress: fromDocument },
            { text: 'Cancelar', style: 'cancel' },
        ]);
    };

    const removeAt = (i: number) => onChange((value || []).filter((_, idx) => idx !== i));

    return (
        <View>
            {value?.length > 0 && (
                <View style={styles.chips}>
                    {value.map((url, i) => (
                        <View key={url + i} style={styles.chip}>
                            {isPdf(url)
                                ? <FileText size={14} color={C.textMuted} />
                                : <Image source={{ uri: url }} style={styles.thumb} />}
                            <Text style={styles.chipText} numberOfLines={1}>{fileName(url)}</Text>
                            {!disabled && (
                                <TouchableOpacity onPress={() => removeAt(i)} hitSlop={6}><X size={14} color={C.textFaint} /></TouchableOpacity>
                            )}
                        </View>
                    ))}
                </View>
            )}
            {!disabled && (
                <TouchableOpacity style={styles.addBtn} onPress={pick} disabled={uploading} activeOpacity={0.7}>
                    {uploading ? <Loader size={15} color={C.textMuted} /> : <UploadCloud size={15} color={C.textMuted} />}
                    <Text style={styles.addText}>{uploading ? 'Subiendo...' : label}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const makeStyles = () => StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 6, paddingVertical: 5, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, maxWidth: '100%' },
    chipText: { fontSize: Theme.font.size.sm, color: C.info, maxWidth: 130 },
    thumb: { width: 22, height: 22, borderRadius: 4 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: S.md, paddingVertical: 8, borderRadius: Theme.radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderStrong },
    addText: { fontSize: Theme.font.size.sm, fontWeight: '600', color: C.textMuted },
});
