// Iconos del tiempo (trazos al estilo Lucide), compartidos por la app y las páginas estáticas.
// Solo constantes: es seguro insertarlos como HTML.
const CLOUD_TOP = 'M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24';
const SUN_SMALL = 'M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13';

export const ICON_PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  partly: `<path d="${SUN_SMALL}M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>`,
  'partly-night': '<path d="M10.19 8.5A6 6 0 0 1 16 4a1 1 0 0 0 6 6 6 6 0 0 1-3 5.2M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  fog: `<path d="${CLOUD_TOP}M16 17H7M17 21H9"/>`,
  drizzle: `<path d="${CLOUD_TOP}M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>`,
  rain: `<path d="${CLOUD_TOP}M16 14v6M8 14v6M12 16v6"/>`,
  showers: `<path d="${SUN_SMALL}M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24M11 20v2M7 19v2"/>`,
  snow: `<path d="${CLOUD_TOP}M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>`,
  storm: '<path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97M13 12l-3 5h4l-3 5"/>',
};

export const iconSvg = (key) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[key]}</svg>`;
