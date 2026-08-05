import React from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, AppHeader, Theme } from '../../components/ui';
import RouteReport from '../../components/RouteReport';

const S = Theme.spacing;

export default function HistorialScreen() {
  const params = useLocalSearchParams<{ deviceId?: string; name?: string; placa?: string }>();
  const deviceId = params.deviceId || '';

  return (
    <Screen>
      <AppHeader
        title="Historial de Ruta"
        subtitle={params.placa ? `${params.name || 'Dispositivo'} · ${params.placa}` : params.name || 'Recorrido del día'}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <RouteReport deviceId={deviceId} showDaySelector />
      </ScrollView>
    </Screen>
  );
}
