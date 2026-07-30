import { Redirect } from 'expo-router';

// "Flota en Vivo" se fusionó con "Rastreo" (mostraban el mismo mapa), igual que en la
// web. Mantener /flota como redirección evita romper accesos antiguos.
export default function FlotaRedirect() {
  return <Redirect href="/(app)/rastreo" />;
}
