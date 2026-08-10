// Pestaña "Mis consegnas": es la misma pantalla de Operaciones, pero el tab la
// abre con initialParams { mias: '1' } (ver _layout.tsx), así llega filtrada a
// las entregas del propio supervisor (sus metas). No duplica lógica.
export { default } from './operaciones';
