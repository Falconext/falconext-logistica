// Ensamblador de diccionarios. El chrome vive en dicts/_common.ts y cada página
// aporta su propio namespace (dicts/<ns>.ts con `export const es` / `export const it`).
// Se fusionan aquí: t('operaciones.titulo') resuelve dicts/operaciones.ts → es/it.

import { es as commonEs, it as commonIt } from './dicts/_common';

// --- Namespaces de páginas (se añaden a medida que se traducen) ---
import * as operaciones from './dicts/operaciones';
import * as trabajadores from './dicts/trabajadores';
import * as vehiculos from './dicts/vehiculos';
import * as mantenimiento from './dicts/mantenimiento';
import * as peajes from './dicts/peajes';
import * as combustible from './dicts/combustible';
import * as calendario from './dicts/calendario';
import * as reportes from './dicts/reportes';
import * as alertas from './dicts/alertas';
import * as scadenze from './dicts/scadenze';
import * as dispositivos from './dicts/dispositivos';
import * as geocercas from './dicts/geocercas';
import * as panel from './dicts/panel';
import * as dashboard from './dicts/dashboard';
import * as flota from './dicts/flota';
import * as rastreo from './dicts/rastreo';
import * as admin from './dicts/admin';
import * as componentes from './dicts/componentes';

type NsModule = { es: Record<string, any>; it: Record<string, any> };

const NAMESPACES: Record<string, NsModule> = {
    operaciones,
    trabajadores,
    vehiculos,
    mantenimiento,
    peajes,
    combustible,
    calendario,
    reportes,
    alertas,
    scadenze,
    dispositivos,
    geocercas,
    panel,
    dashboard,
    flota,
    rastreo,
    admin,
    componentes,
};

function assemble(base: Record<string, any>, pick: (m: NsModule) => Record<string, any>) {
    const out: Record<string, any> = { ...base };
    for (const [key, mod] of Object.entries(NAMESPACES)) {
        out[key] = pick(mod);
    }
    return out;
}

export const es = assemble(commonEs, (m) => m.es);
export const it = assemble(commonIt, (m) => m.it);

export type Dict = typeof es;

export const DICTIONARIES = { es, it };
export type Locale = keyof typeof DICTIONARIES;
export const LOCALES: Locale[] = ['es', 'it'];
export const DEFAULT_LOCALE: Locale = 'es';
