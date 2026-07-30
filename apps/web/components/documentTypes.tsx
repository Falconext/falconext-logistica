import {
    CreditCard, Car, Hash, FileSignature, Truck, Plane, Home, Languages,
    FileSearch, FileCheck2, Recycle, Shield, Snowflake, ScrollText, Wrench, Stamp,
} from 'lucide-react';
import type { DocType } from './DocumentosPanel';

// Documentos del TRABAJADOR (sistema italiano de la ficha original).
//
// Nota i18n: `label` se envía al backend (campo `nombre` del documento) y no se
// traduce. `sub` es solo texto visible en la UI; como este módulo NO es un
// componente React (no puede usar el hook `useT`), aquí `sub` guarda la CLAVE
// de traducción (namespace `componentes.docTypes.*`) y es el consumidor —
// `DocumentosPanel` (que sí es cliente y usa `useT`) — quien la resuelve con
// `t(dt.sub)` antes de mostrarla.
export const TRABAJADOR_DOCS: DocType[] = [
    { key: 'CARTA_IDENTITA', label: "Carta d'Identità", sub: 'componentes.docTypes.trabajador.cartaIdentita', icon: CreditCard },
    { key: 'PATENTE', label: 'Patente', sub: 'componentes.docTypes.trabajador.patente', icon: Car },
    { key: 'CODICE_FISCALE', label: 'Codice Fiscale', sub: 'componentes.docTypes.trabajador.codiceFiscale', icon: Hash },
    { key: 'CONTRATTO', label: 'Contratto', sub: 'componentes.docTypes.trabajador.contratto', icon: FileSignature },
    { key: 'PERMESSO_TRASPORTO', label: 'Permesso al Trasporto', sub: 'componentes.docTypes.trabajador.permessoTrasporto', icon: Truck },
    { key: 'PASSAPORTO', label: 'Passaporto', sub: 'componentes.docTypes.trabajador.passaporto', icon: Plane, muted: true },
    { key: 'SOGGIORNO', label: 'Soggiorno', sub: 'componentes.docTypes.trabajador.soggiorno', icon: Home },
    { key: 'TRADUZIONE_PATENTE', label: 'Traduzione Patente', sub: 'componentes.docTypes.trabajador.traduzionePatente', icon: Languages, muted: true },
    { key: 'RESPONSIVA', label: 'Responsiva', sub: 'componentes.docTypes.trabajador.responsiva', icon: FileSearch },
    { key: 'UNILAV', label: 'Unilav', sub: 'componentes.docTypes.trabajador.unilav', icon: FileCheck2 },
    { key: 'TREDICESIMA_QUATTORDICESIMA', label: '13ma / 14ma', sub: 'componentes.docTypes.trabajador.tredicesima', icon: Recycle },
];

// Documentos del VEHÍCULO (LIBRETO, ASEG, COIB + revisión/permisos).
export const VEHICULO_DOCS: DocType[] = [
    { key: 'LIBRETO', label: 'Libretto', sub: 'componentes.docTypes.vehiculo.libreto', icon: ScrollText },
    { key: 'ASSICURAZIONE', label: 'Assicurazione', sub: 'componentes.docTypes.vehiculo.assicurazione', icon: Shield },
    { key: 'REVISIONE', label: 'Revisione', sub: 'componentes.docTypes.vehiculo.revisione', icon: Wrench },
    { key: 'COIBENTAZIONE', label: 'Coibentazione', sub: 'componentes.docTypes.vehiculo.coibentazione', icon: Snowflake },
    { key: 'DEROGHE', label: 'Deroghe', sub: 'componentes.docTypes.vehiculo.deroghe', icon: Stamp, muted: true },
];
