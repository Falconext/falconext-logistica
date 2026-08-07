// ETA (según el empresario) = HORA LÍMITE de entrega del paquete ("la leta") +
// un contador de cuánto falta. NO es el tiempo de llegada de Google Maps (eso es
// otra métrica aparte, "Llega en (Maps)"). Este helper centraliza el formato y el
// estado (normal / urgente <30min / retrasado) para chofer y supervisor.

export interface EtaInfo {
  restanMin: number;   // + = faltan; - = retrasado
  deadline: string;    // hora límite absoluta (hora de Italia), p.ej. "07 ago, 08:00"
  countdown: string;   // "Faltan 8h 30m" | "... · llama al cliente" | "Entrega retrasada 45 min"
  color: string;       // color del badge según estado
  urgent: boolean;     // <= 30 min
  late: boolean;       // ya pasó la hora
}

function fmtDur(mins: number): string {
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Hora límite en horario de Italia (Europe/Rome). Con fallback por si el motor
// no soporta timeZone en Intl.
function fmtDeadline(d: Date): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Rome',
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(d).replace(',', '');
  } catch {
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}

export function etaInfo(fechaEntrega?: string | null): EtaInfo | null {
  if (!fechaEntrega) return null;
  const d = new Date(fechaEntrega);
  if (isNaN(d.getTime())) return null;
  const restanMin = Math.round((d.getTime() - Date.now()) / 60000);
  const late = restanMin < 0;
  const urgent = !late && restanMin <= 30;
  const color = late ? '#DC2626' : urgent ? '#B45309' : '#16A34A';
  const countdown = late
    ? `Entrega retrasada ${fmtDur(restanMin)}`
    : `Faltan ${fmtDur(restanMin)}${urgent ? ' · llama al cliente' : ''}`;
  return { restanMin, deadline: fmtDeadline(d), countdown, color, urgent, late };
}
