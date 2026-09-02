// Namespace de traducción: panel (Torre de Control — flota en vivo, estado de consegnas, resumen del día).
// app/panel/page.tsx

export const es = {
    header: {
        titulo: 'Panel de Control',
        enVivo: 'EN VIVO',
        subtitulo: 'Torre operativa · flota en vivo y entregas',
        actualizado: '· actualizado {hora}',
        actualizar: 'Actualizar',
        cargando: 'Cargando panel...',
    },
    kpi: {
        entregasActivas: 'Entregas activas',
        enConsegna: 'En consegna',
        inSospeso: 'In sospeso',
    },
    mapa: {
        titulo: 'Flota en vivo',
        verRastreo: 'Ver rastreo →',
    },
    tabs: {
        inConsegna: 'In Consegna',
        inSospeso: 'In Sospeso',
    },
    entregas: {
        sinEntregasRuta: 'Sin entregas en ruta.',
        sinEntregasPendientes: 'Sin entregas pendientes.',
        verEnOperaciones: 'Ver en Operaciones',
        sinConductor: 'Sin conductor',
        sinDestino: 'Sin destino',
    },
    resumenDia: {
        titulo: 'Resumen del día',
        sinOperaciones: 'Sin operaciones registradas hoy.',
        estados: {
            CONSEGNATO: 'Consegnato',
            IN_CONSEGNA: 'In Consegna',
            ACCETTATA: 'Aceptada',
            IN_SOSPESO: 'In Sospeso',
            RITIRATO: 'Ritirato',
            RISCHEDULATO: 'Rischedulato',
            ANNULLATO: 'Annullato',
            SIN_ESTADO: 'Sin estado',
        },
        columnas: {
            autista: 'Autista',
            datosConsegna: 'Datos consegna',
            spedizione: 'Spedizione',
            cliente: 'Cliente',
        },
    },
    toasts: {
        errorCargar: 'Error cargando el panel',
        errorDisponibilidad: 'No se pudo actualizar la disponibilidad',
    },
    tiempo: {
        sinFecha: 'Sin fecha',
        atrasado: 'Atrasado {parts}',
        en: 'En {parts}',
        diasHoras: '{d}d {h}h',
        horasMin: '{h}h {m}m',
        min: '{m}m',
        ahora: 'ahora',
        haceMin: 'hace {min} min',
        haceHoras: 'hace {h} h',
        haceDias: 'hace {d} d',
    },
};

export const it: typeof es = {
    header: {
        titulo: 'Pannello di Controllo',
        enVivo: 'IN DIRETTA',
        subtitulo: 'Torre operativa · flotta in diretta e consegne',
        actualizado: '· aggiornato {hora}',
        actualizar: 'Aggiorna',
        cargando: 'Caricamento pannello...',
    },
    kpi: {
        entregasActivas: 'Consegne attive',
        enConsegna: 'In consegna',
        inSospeso: 'In sospeso',
    },
    mapa: {
        titulo: 'Flotta in diretta',
        verRastreo: 'Vedi tracciamento →',
    },
    tabs: {
        inConsegna: 'In Consegna',
        inSospeso: 'In Sospeso',
    },
    entregas: {
        sinEntregasRuta: 'Nessuna consegna in corso.',
        sinEntregasPendientes: 'Nessuna consegna in sospeso.',
        verEnOperaciones: 'Vedi in Operazioni',
        sinConductor: 'Senza autista',
        sinDestino: 'Senza destinazione',
    },
    resumenDia: {
        titulo: 'Riepilogo del giorno',
        sinOperaciones: 'Nessuna operazione registrata oggi.',
        estados: {
            CONSEGNATO: 'Consegnato',
            IN_CONSEGNA: 'In Consegna',
            ACCETTATA: 'Accettata',
            IN_SOSPESO: 'In Sospeso',
            RITIRATO: 'Ritirato',
            RISCHEDULATO: 'Rischedulato',
            ANNULLATO: 'Annullato',
            SIN_ESTADO: 'Senza stato',
        },
        columnas: {
            autista: 'Autista',
            datosConsegna: 'Dati consegna',
            spedizione: 'Spedizione',
            cliente: 'Cliente',
        },
    },
    toasts: {
        errorCargar: 'Errore nel caricamento del pannello',
        errorDisponibilidad: 'Non è stato possibile aggiornare la disponibilità',
    },
    tiempo: {
        sinFecha: 'Senza data',
        atrasado: 'In ritardo {parts}',
        en: 'Tra {parts}',
        diasHoras: '{d}g {h}h',
        horasMin: '{h}h {m}m',
        min: '{m}m',
        ahora: 'ora',
        haceMin: '{min} min fa',
        haceHoras: '{h} h fa',
        haceDias: '{d} g fa',
    },
};
