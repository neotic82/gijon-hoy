// Capa de datos: URLs del portal y limpieza. Sin DOM, para poder probarla con node --test.

export const dataUrl = (id) => `https://opendata.gijon.es/descargar.php?id=${id}&tipo=JSON`;

export const AIR_ID = 1;
export const EVENT_IDS = { agenda: 728, institucional: 889 };
export const WATER_IDS = { tap: 731, bathing: 879 };
export const NOTICES_ID = 733;

// JSON públicos de la web municipal. No están documentados como API: si fallan se recurre
// a los conjuntos abiertos, que tienen el mismo contenido pero llevan tiempo sin actualizarse.
export const WEB_URLS = {
  events: 'https://drupal.gijon.es/es/listado_eventos_tes4/?_format=json',
  notices: 'https://drupal.gijon.es/listado_incidencias_trafico/?_format=json',
};
const SITE = 'https://www.gijon.es';

const LODGING = '#7355d6';

export const CATEGORIES = [
  // Orden y colores validados como paleta categórica (daltonismo incluido): no reordenar sin revalidar.
  // Los alojamientos comparten color y se distinguen por la letra de la chincheta.
  { key: 'playas', ids: [749], label: 'Playas', color: '#1282a2', on: true },
  { key: 'monumentos', ids: [743], label: 'Monumentos', color: '#e07b39', on: true },
  { key: 'parques', ids: [792], label: 'Parques', color: '#2f9e6e', on: true },
  { key: 'museos', ids: [790], label: 'Museos', color: '#c2379b', on: true },
  { key: 'hoteles', ids: [736, 783], label: 'Hoteles', color: LODGING, glyph: 'H', on: true },
  { key: 'hostales', ids: [782], label: 'Hostales', color: LODGING, glyph: 'Hs', on: true },
  { key: 'apartamentos', ids: [761], label: 'Apartamentos turísticos', color: LODGING, glyph: 'A', on: true },
  { key: 'campings', ids: [767], label: 'Campings', color: LODGING, glyph: 'C', on: true },
  // El conjunto propio de albergues (758) está vacío; los albergues aparecen en «Alojamientos» (759).
  { key: 'albergues', ids: [759], match: /albergue/i, label: 'Albergues', color: LODGING, glyph: 'Al', on: true },
  { key: 'cajeros', ids: [748], label: 'Cajeros ciudadanos', color: '#b8a11f', on: false },
  { key: 'bibliotecas', ids: [739], label: 'Bibliotecas', color: '#4a5fc1', on: false },
  { key: 'restaurantes', ids: [810], label: 'Restaurantes y sidrerías', color: '#d1495b', on: false },
];

// El portal no publica las unidades: son las habituales en este tipo de análisis.
export const TAP_PARAMS = [
  { key: 'clorolibre', label: 'Cloro libre', unit: 'mg/l', main: true },
  { key: 'ph', label: 'pH', unit: '', main: true },
  { key: 'turbidez', label: 'Turbidez', unit: 'UNF', main: true },
  { key: 'conductividad', label: 'Conductividad', unit: 'µS/cm', main: true },
  { key: 'temperatura', label: 'Temperatura', unit: '°C', main: true },
  { key: 'dureza', label: 'Dureza', unit: 'mg/l CaCO₃', main: true },
  { key: 'nitratos', label: 'Nitratos', unit: 'mg/l' },
  { key: 'nitritos', label: 'Nitritos', unit: 'mg/l' },
  { key: 'amonio', label: 'Amonio', unit: 'mg/l' },
  { key: 'cloruros', label: 'Cloruros', unit: 'mg/l' },
  { key: 'fluor', label: 'Flúor', unit: 'mg/l' },
  { key: 'sodio', label: 'Sodio', unit: 'mg/l' },
  { key: 'calcio', label: 'Calcio', unit: 'mg/l' },
  { key: 'magnesio', label: 'Magnesio', unit: 'mg/l' },
  { key: 'aluminio', label: 'Aluminio', unit: 'mg/l' },
  { key: 'trihalometanos', label: 'Trihalometanos', unit: 'mg/l' },
  { key: 'oxidabilidad', label: 'Oxidabilidad', unit: 'mg/l' },
];

export const TAP_BACTERIA = [
  { key: 'bacteríascoliformes', label: 'Bacterias coliformes' },
  { key: 'escherichiacoli', label: 'E. coli' },
  { key: 'enterococos', label: 'Enterococos' },
  { key: 'clostridiumperfringens', label: 'Clostridium perfringens' },
  { key: 'pseudomonasaeruginosa', label: 'Pseudomonas aeruginosa' },
];

const BATH_ZONES = [
  { key: 'oestearbeyal', label: 'El Arbeyal, oeste', beach: /arbeyal/i },
  { key: 'estearbeyal', label: 'El Arbeyal, este', beach: /arbeyal/i },
  { key: 'oesteponiente', label: 'Poniente, oeste', beach: /poniente/i },
  { key: 'esteponiente', label: 'Poniente, este', beach: /poniente/i },
  { key: 'escalera4', label: 'San Lorenzo, escalera 4', beach: /san lorenzo/i },
  { key: 'escalera8', label: 'San Lorenzo, escalera 8', beach: /san lorenzo/i },
  { key: 'escalera12', label: 'San Lorenzo, escalera 12', beach: /san lorenzo/i },
  { key: 'vahones', label: 'Los Vahones', beach: /vahones/i },
  { key: 'rinconín', label: 'El Rinconín', beach: /rincon[ií]n/i },
  { key: 'peñarrubia', label: 'Peñarrubia', beach: /peñarrubia/i },
  { key: 'serín', label: 'Serín', beach: /ser[ií]n/i },
  { key: 'estaño', label: 'Estaño', beach: /estaño/i },
];

export const DISTRICTS = ['Centro', 'Este', 'Oeste', 'Sur', 'Llano', 'Rural'];
export const districtLabel = (district) => (district === 'Llano' ? 'El Llano' : district);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Bandas del Índice Europeo de Calidad del Aire (AEMA, µg/m³): límite superior de cada nivel.
// El último nivel no tiene límite. https://airindex.eea.europa.eu/AQI/index.html
export const AQI_BANDS = {
  pm25: [5, 15, 50, 90, 140],
  pm10: [15, 45, 120, 195, 270],
  no2: [10, 25, 60, 100, 150],
  o3: [60, 100, 120, 160, 180],
  so2: [20, 40, 125, 190, 275],
};

export const AQI_LEVELS = [
  'Buena',
  'Razonablemente buena',
  'Regular',
  'Desfavorable',
  'Muy desfavorable',
  'Extremadamente desfavorable',
];

export const POLLUTANT_LABELS = { pm25: 'PM2,5', pm10: 'PM10', no2: 'NO₂', o3: 'O₃', so2: 'SO₂' };

const HOUR = 3600e3;
const POLLUTANTS = Object.keys(AQI_BANDS);
const AVERAGED = new Set(['pm25', 'pm10']); // El índice usa media móvil de 24 h para partículas.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? match;
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : match;
  });
}

export function plainText(html) {
  const text = String(html ?? '')
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

export function safeUrl(value) {
  const text = String(value ?? '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

// El portal mezcla números, cadenas numéricas y cadenas vacías en el mismo campo.
export function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Acepta "Lon: -5.6, Lat: 43.5" y "Lat: 43.5, Lon -5.6". Descarta lo que caiga fuera del concejo.
export function parseCoords(text) {
  const source = String(text ?? '');
  const lat = toNumber(source.match(/Lat:?\s*(-?\d+(?:\.\d+)?)/i)?.[1]);
  const lon = toNumber(source.match(/Lon:?\s*(-?\d+(?:\.\d+)?)/i)?.[1]);
  if (lat === null || lon === null) return null;
  if (lat < 43.35 || lat > 43.65 || lon < -5.9 || lon > -5.45) return null;
  return { lat, lon };
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function normalizePlaces(rows, category) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row, index) => {
    const coords = parseCoords(row.localizacion);
    if (!coords) return [];
    const buses = [...String(row.lineas_bus ?? '').matchAll(/L[íi]nea\s+([\w-]+)/g)].map((m) => m[1]);
    return [{
      id: `${category}-${index}`,
      category,
      title: plainText(row.titulo) || 'Sin título',
      ...coords,
      address: plainText(row.direccion),
      schedule: plainText(row.horario),
      phone: plainText(row.telefono),
      web: safeUrl(row.web),
      description: plainText(row.descripcion),
      image: safeUrl(row.imagen),
      buses: [...new Set(buses)],
      district: plainText(row.distrito),
      lineNames: [...parseLineNames(row.lineas_bus)],
    }];
  });
}

export function aqiLevel(pollutant, value) {
  if (value === null || value === undefined) return null;
  const bands = AQI_BANDS[pollutant];
  const rounded = Math.round(value);
  const index = bands.findIndex((limit) => rounded <= limit);
  return index === -1 ? bands.length : index;
}

function readingFromRow(row) {
  const [y, m, d] = String(row.fecha).split('-').map(Number);
  const hour = toNumber(row.periodo);
  if (!y || !m || !d || hour === null) return null;
  const reading = {
    // El portal publica fecha solar (UTC); cada periodo es la hora que termina en ese número.
    time: Date.UTC(y, m - 1, d, hour),
    pm25: toNumber(row.pm25), pm10: toNumber(row.pm10), no2: toNumber(row.no2), o3: toNumber(row.o3), so2: toNumber(row.so2),
    temp: toNumber(row.tmp), humidity: toNumber(row.hr), wind: toNumber(row.vv), rain: toNumber(row.ll),
  };
  return POLLUTANTS.some((p) => reading[p] !== null) ? reading : null;
}

function latestValue(readings, key, sinceTime) {
  for (let i = readings.length - 1; i >= 0 && readings[i].time >= sinceTime; i--) {
    if (readings[i][key] !== null) return readings[i][key];
  }
  return null;
}

function mean(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

// Devuelve el resumen por estación. Ignora filas antiguas (el fichero trae días de 2021)
// y las horas aún sin medir. Las estaciones sin lectura reciente quedan fuera.
export function summarizeAir(payload, now = Date.now(), maxAgeHours = 12) {
  const rows = payload?.calidadairemediatemporales?.calidadairemediatemporal;
  if (!Array.isArray(rows)) return [];
  const byStation = new Map();
  for (const row of rows) {
    const reading = readingFromRow(row);
    if (!reading || reading.time > now + HOUR || reading.time < now - 8 * 24 * HOUR) continue;
    if (!byStation.has(row.estacion)) {
      byStation.set(row.estacion, {
        id: row.estacion,
        name: plainText(row['título'] ?? row.titulo).replace(/^Estación\s+(de\s+)?/i, ''),
        lat: toNumber(row.latitud),
        lon: toNumber(row.longitud),
        readings: [],
      });
    }
    byStation.get(row.estacion).readings.push(reading);
  }

  const stations = [];
  for (const station of byStation.values()) {
    const readings = station.readings.sort((a, b) => a.time - b.time);
    const updated = readings.at(-1).time;
    if (updated < now - maxAgeHours * HOUR) continue;

    const pollutants = {};
    for (const key of POLLUTANTS) {
      let value;
      if (AVERAGED.has(key)) {
        const day = readings.filter((r) => r.time > updated - 24 * HOUR && r[key] !== null).map((r) => r[key]);
        value = day.length >= 12 ? mean(day) : null;
      } else {
        value = latestValue(readings, key, updated - 3 * HOUR);
      }
      if (value !== null) pollutants[key] = { value, level: aqiLevel(key, value), averaged: AVERAGED.has(key) };
    }
    const entries = Object.entries(pollutants);
    if (!entries.length) continue;
    const [dominant, worst] = entries.reduce((a, b) => (b[1].level > a[1].level ? b : a));
    const since = updated - 3 * HOUR;
    stations.push({
      id: station.id, name: station.name, lat: station.lat, lon: station.lon, updated,
      level: worst.level, dominant, pollutants,
      weather: {
        temp: latestValue(readings, 'temp', since), humidity: latestValue(readings, 'humidity', since),
        wind: latestValue(readings, 'wind', since), rain: latestValue(readings, 'rain', since),
      },
      history: readings.filter((r) => r.time > updated - 24 * HOUR)
        .map((r) => ({ time: r.time, value: r[dominant] })).filter((p) => p.value !== null),
    });
  }
  return stations.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'es'));
}

// Formatos reales del portal:
//   "2024-08-30\n | 2025-06-20"  ·  "2025-02-17\n - 2025-03-05"  ·  "2025-10-11"
//   "Mié, 18/11/2026 - 15:00\n - Mié, 18/11/2026 - 21:00\n, Jue, 19/11/2026 - 15:00\n - ..."
export function parseSessions(text, startTime = '', endTime = '') {
  const source = String(text ?? '');
  const spanish = [...source.matchAll(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{2}):(\d{2}))?/g)];
  const sessions = [];
  if (spanish.length) {
    for (let i = 0; i + 1 < spanish.length; i += 2) {
      const [, d1, m1, y1, h1 = '0', n1 = '0'] = spanish[i];
      const [, d2, m2, y2, h2 = '23', n2 = '59'] = spanish[i + 1];
      sessions.push({
        start: new Date(+y1, +m1 - 1, +d1, +h1, +n1).getTime(),
        end: new Date(+y2, +m2 - 1, +d2, +h2, +n2).getTime(),
      });
    }
    return sessions;
  }
  const iso = [...source.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)];
  if (!iso.length) return [];
  const [, y1, m1, d1] = iso[0];
  const [, y2, m2, d2] = iso.at(-1);
  const isTime = (value) => /^\d{2}:\d{2}$/.test(value);
  // Rarezas reales: hora de inicio 23:59 significa «sin hora», y fin vacío, 00:00 o 23:59, «sin hora de fin».
  const [h1, n1] = isTime(startTime) && startTime !== '23:59' ? startTime.split(':').map(Number) : [0, 0];
  let openEnd = !isTime(endTime) || endTime === '00:00' || endTime === '23:59';
  const start = new Date(+y1, +m1 - 1, +d1, h1, n1).getTime();
  const lastMoment = new Date(+y2, +m2 - 1, +d2, 23, 59).getTime();
  let end = lastMoment;
  if (!openEnd) {
    const [h2, n2] = endTime.split(':').map(Number);
    end = new Date(+y2, +m2 - 1, +d2, h2, n2).getTime();
    if (end < start) {
      end = lastMoment;
      openEnd = true;
    }
  }
  return [{ start, end, openEnd }];
}

const sameLocalDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

const DAY = 24 * HOUR;
export const isLongRunning = (event) => event.end - event.start > 7 * DAY;

export function occursBetween(event, from, to) {
  return event.sessions.some((s) => s.start <= to && s.end >= from);
}

function resolveUrl(value, prefix) {
  const text = decodeEntities(String(value ?? '')).trim();
  return text.startsWith('/') ? `${prefix}${text}` : safeUrl(text);
}

// La web repite el mismo acto en una fila por cada lugar: se agrupan por id.
function mergeRowsById(rows) {
  const merged = new Map();
  rows.forEach((row, index) => {
    const key = row.id || `fila-${index}`;
    const place = plainText(row.titulo_directorio || row.field_lo_name);
    if (!merged.has(key)) merged.set(key, { row, places: [] });
    const entry = merged.get(key);
    if (place && !entry.places.includes(place)) entry.places.push(place);
  });
  return [...merged.values()];
}

function isAllDay({ start, end }) {
  const a = new Date(start);
  const b = new Date(end);
  return a.getHours() === 0 && a.getMinutes() === 0 && b.getHours() === 23 && b.getMinutes() === 59;
}

function toEvent(raw, now) {
  const sessions = raw.sessions.filter((s) => s.end >= now).sort((a, b) => a.start - b.start);
  const next = sessions[0];
  if (!raw.title || !next) return null;
  const startedWithoutEnd = next.openEnd && sameLocalDay(next.start, next.end);
  return { openEnd: false, ...raw, sessions, ...next, ongoing: next.start <= now && !startedWithoutEnd, allDay: isAllDay(next) };
}

export function normalizeEvents(agendaRows, institutionalRows, now = Date.now()) {
  const agenda = mergeRowsById(Array.isArray(agendaRows) ? agendaRows : []).map(({ row: r, places }) => toEvent({
    source: 'agenda',
    title: plainText(r.titulo),
    place: places.length > 1 ? `${places[0]} y ${places.length - 1} más` : (places[0] ?? ''),
    address: plainText(r.direccion_directorio || r.field_lo_address),
    type: plainText(r.tipo),
    topic: plainText(r.materia),
    district: plainText(r.distrito),
    image: resolveUrl(r.imagen, SITE),
    url: resolveUrl(r.alias, `${SITE}/es/eventos`),
    sessions: parseSessions(r.fechas || r.fecha_inicio, r.hora_inicio, r.hora_fin),
  }, now));
  const institutional = (Array.isArray(institutionalRows) ? institutionalRows : []).map((r) => toEvent({
    source: 'institucional',
    title: plainText(r.titulo),
    place: plainText(r.localizacion_en_directorio),
    address: '',
    type: plainText(r.tipo_evento),
    topic: plainText(r.materia),
    district: plainText(r.distrito),
    image: safeUrl(r.imagen),
    url: safeUrl(r.redireccion),
    sessions: parseSessions(r.fechas),
  }, now));

  const seen = new Set();
  return [...agenda, ...institutional]
    .filter(Boolean)
    .filter((e) => {
      // El portal repite filas (una por idioma) y un acto puede estar en las dos agendas.
      const key = `${e.title.toLowerCase()}|${new Date(e.start).toDateString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Orden cronológico: lo que ya ha empezado cuenta como «ahora».
    .sort((a, b) => Math.max(a.start, now) - Math.max(b.start, now) || a.end - b.end);
}

function parseOffsetDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const time = Date.parse(text.replace(/Z(?=[+-])/, '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(time) ? time : null;
}

// Acepta el JSON de la web («field_lineas_de_autobus») y el conjunto abierto 733.
export function normalizeNotices(rows, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const start = parseOffsetDate(r.fecha_inicio_html ?? r.fecha_inicio_corte);
    const end = parseOffsetDate(r.fecha_fin_html ?? r.fecha_fin_corte);
    const title = plainText(r.titulo);
    if (!title || (end !== null && end < now)) return [];
    const lines = r.field_lineas_de_autobus !== undefined
      ? String(r.field_lineas_de_autobus).split(',').map((s) => plainText(s)).filter(Boolean)
      : [...String(r.lineas_autobus_afectadas ?? '').matchAll(/L[íi]nea\s+(\w+)/g)].map((m) => `L${m[1]}`);
    return [{
      id: r.id || title,
      title,
      type: plainText(r.tipo ?? r.tipo_incidencia),
      description: plainText(r.descripcion),
      start,
      end,
      lines: [...new Set(lines)],
      district: plainText(r.distrito),
      url: resolveUrl(r.alias ?? r.url, `${SITE}/es/avisos`),
    }];
  }).sort((a, b) => (a.end ?? Infinity) - (b.end ?? Infinity) || (b.start ?? 0) - (a.start ?? 0));
}

export function summarizeTapWater(payload) {
  const rows = payload?.verificaciones?.verificacion;
  if (!Array.isArray(rows) || !rows.length) return null;
  const sorted = [...rows].sort((a, b) => toNumber(a['año']) - toNumber(b['año'])
    || MONTHS.indexOf(String(a.mes).toLowerCase()) - MONTHS.indexOf(String(b.mes).toLowerCase())
    || a.id - b.id);
  const timeOf = (row) => Date.UTC(toNumber(row['año']), MONTHS.indexOf(String(row.mes).toLowerCase()), 15);
  const latest = sorted.at(-1);
  const series = (key) => sorted.slice(-24)
    .map((row) => ({ time: timeOf(row), value: toNumber(row[key]) }))
    .filter((p) => p.value !== null);
  return {
    point: plainText(latest.puntodemuestreo),
    month: String(latest.mes).toLowerCase(),
    year: latest['año'],
    time: timeOf(latest),
    samples: rows.length,
    params: TAP_PARAMS.map((p) => ({ ...p, raw: String(latest[p.key] ?? '').trim(), series: series(p.key) })),
    bacteria: TAP_BACTERIA.map((b) => ({ ...b, value: toNumber(latest[b.key]) })),
    germs: toNumber(latest['gérmenestotalesa22ºc']),
  };
}

function parseSpanishDate(text) {
  const match = String(text ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? new Date(+match[3], +match[2] - 1, +match[1]).getTime() : null;
}

function bathStatus(text) {
  const value = String(text ?? '').trim();
  if (/no\s+recomendable/i.test(value)) return 'warn';
  if (/^apta/i.test(value)) return 'ok';
  return null;
}

export function summarizeBathing(payload) {
  const rows = payload?.agrupacion_zonas?.zonas;
  if (!Array.isArray(rows) || !rows.length) return null;
  const samples = rows.map((row) => ({ row, date: parseSpanishDate(row.fecha) }))
    .filter((s) => s.date !== null).sort((a, b) => b.date - a.date);
  if (!samples.length) return null;
  const zones = BATH_ZONES.map((zone) => {
    const measured = samples.filter((s) => bathStatus(s.row[zone.key]));
    const last = measured[0];
    return {
      key: zone.key,
      label: zone.label,
      beach: zone.beach,
      status: last ? bathStatus(last.row[zone.key]) : null,
      date: last?.date ?? null,
      warnings: measured.filter((s) => bathStatus(s.row[zone.key]) === 'warn').length,
      measured: measured.length,
    };
  });
  return { latest: samples[0].date, samples: samples.length, zones };
}

export function bathingForBeach(summary, title) {
  const zones = summary?.zones.filter((z) => z.beach.test(title) && z.status) ?? [];
  if (!zones.length) return null;
  return {
    status: zones.some((z) => z.status === 'warn') ? 'warn' : 'ok',
    date: Math.max(...zones.map((z) => z.date)),
  };
}

// «Línea 14 Sotiello - Pol. Somonte, Línea 25 Tremañes» → Map { 'L14' => 'Sotiello - Pol. Somonte', 'L25' => 'Tremañes' }
export function parseLineNames(text) {
  const names = new Map();
  for (const match of String(text ?? '').matchAll(/L[íi]nea\s+(\w+)\s*([^,]*)/g)) {
    const code = `L${match[1]}`;
    if (!names.has(code)) names.set(code, plainText(match[2]));
  }
  return names;
}

export function compareLines(a, b) {
  const rank = (code) => ({ L: 0, B: 1 }[code[0]] ?? 2);
  const num = (code) => Number(code.replace(/\D/g, '')) || 0;
  return rank(a) - rank(b) || num(a) - num(b) || a.localeCompare(b);
}

// Un campo de distrito con cuatro o más distritos se refiere a toda la ciudad.
export function inDistrict(text, district) {
  const list = String(text ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  return Boolean(district) && (list.length >= 4 || list.includes(district));
}

// Centro aproximado de cada distrito a partir de los lugares que el portal sitúa en él.
export function districtCentroids(places) {
  const sums = {};
  for (const place of places) {
    if (!DISTRICTS.includes(place.district)) continue;
    const sum = (sums[place.district] ??= { lat: 0, lon: 0, n: 0 });
    sum.lat += place.lat;
    sum.lon += place.lon;
    sum.n += 1;
  }
  return Object.fromEntries(Object.entries(sums).map(([district, s]) => [district, { lat: s.lat / s.n, lon: s.lon / s.n }]));
}

export function nearestDistrict(point, centroids) {
  return Object.entries(centroids)
    .sort(([, a], [, b]) => distanceKm(point, a) - distanceKm(point, b))[0]?.[0] ?? '';
}

export const linesAffected = (notice, myLines) => notice.lines.filter((line) => myLines.includes(line));
