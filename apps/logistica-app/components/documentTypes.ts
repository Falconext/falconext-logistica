import {
  CreditCard, Car, Hash, FileSignature, Truck, Plane, Home, Languages,
  FileSearch, FileCheck2, Recycle, Shield, Snowflake, ScrollText, Wrench, Stamp,
} from 'lucide-react-native';
import type { DocType } from './DocumentosPanel';

// Documentos del TRABAJADOR (sistema italiano de la ficha original).
export const TRABAJADOR_DOCS: DocType[] = [
  { key: 'CARTA_IDENTITA', label: "Carta d'Identità", sub: 'Documento de identidad', icon: CreditCard },
  { key: 'PATENTE', label: 'Patente', sub: 'Licencia de conducir', icon: Car },
  { key: 'CODICE_FISCALE', label: 'Codice Fiscale', sub: 'Código fiscal', icon: Hash },
  { key: 'CONTRATTO', label: 'Contratto', sub: 'Contrato', icon: FileSignature },
  { key: 'PERMESSO_TRASPORTO', label: 'Permesso al Trasporto', sub: 'Permiso de transporte', icon: Truck },
  { key: 'PASSAPORTO', label: 'Passaporto', sub: 'Pasaporte', icon: Plane, muted: true },
  { key: 'SOGGIORNO', label: 'Soggiorno', sub: 'Permiso de residencia', icon: Home },
  { key: 'TRADUZIONE_PATENTE', label: 'Traduzione Patente', sub: 'Traducción de licencia', icon: Languages, muted: true },
  { key: 'RESPONSIVA', label: 'Responsiva', sub: 'Carta responsiva', icon: FileSearch },
  { key: 'UNILAV', label: 'Unilav', sub: 'Contrato de trabajo (IT)', icon: FileCheck2 },
  { key: 'TREDICESIMA_QUATTORDICESIMA', label: '13ma / 14ma', sub: 'Gratificaciones', icon: Recycle },
];

// Documentos del VEHÍCULO (LIBRETO, ASEG, COIB + revisión/permisos).
export const VEHICULO_DOCS: DocType[] = [
  { key: 'LIBRETO', label: 'Libretto', sub: 'Tarjeta de circulación', icon: ScrollText },
  { key: 'ASSICURAZIONE', label: 'Assicurazione', sub: 'Seguro / Póliza', icon: Shield },
  { key: 'REVISIONE', label: 'Revisione', sub: 'Revisión técnica', icon: Wrench },
  { key: 'COIBENTAZIONE', label: 'Coibentazione', sub: 'Aislamiento térmico', icon: Snowflake },
  { key: 'DEROGHE', label: 'Deroghe', sub: 'Permisos especiales', icon: Stamp, muted: true },
];
