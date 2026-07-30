import { redirect } from 'next/navigation';

// "Flota en Vivo" se fusionó con "Rastreo en Vivo" (mostraban el mismo mapa).
// Mantener /flota como redirección evita romper enlaces/marcadores antiguos.
export default function FlotaRedirect() {
  redirect('/rastreo');
}
