import {
  AIR_ID, AQI_LEVELS, CATEGORIES, WEATHER_URLS, buildIcs, googleCalendarUrl, moonPhase, parseTides, summarizeMarine, summarizeWeather, tideAt, tideCurve, tideUrl, weatherIcon, weatherText, EVENT_IDS, NOTICES_ID, POLLUTANT_LABELS, WATER_IDS, WEB_URLS,
  DISTRICTS, MOBILITY, MOBILITY_COLOR, bathingForBeach, kmlUrl, parseKml, compareLines, dataUrl, distanceKm, districtCentroids, districtLabel, inDistrict, linesAffected, nearestDistrict, isLongRunning, normalizeEvents, normalizeNotices, normalizePlaces,
  occursBetween, plainText, summarizeAir, summarizeBathing, summarizeTapWater,
} from './data.js';
import { iconSvg } from './icons.js';

const TZ = 'Europe/Madrid';
const STALE_HOURS = 4;
const REFRESH_MS = 10 * 60e3;
const OFFICIAL_AGENDA = 'https://www.gijon.es/es/eventos';
const CENTER = [43.5357, -5.6615];

const state = {
  air: null, airError: false, airLoadedAt: 0,
  feedsLoadedAt: 0,
  events: null, eventsError: false, agendaFromWeb: false,
  agendaFilter: { q: '', when: 'today', topic: '', zone: false }, agendaLimit: 40,
  notices: null, noticesError: false, noticesFromWeb: false, noticesExpanded: false,
  tap: null, bathing: null, waterError: false, waterParam: 'clorolibre',
  places: {}, placesFailed: new Set(), mobility: {},
  stationId: store('station'),
  prefs: null,
  weather: null, marine: null, tides: null, weatherError: false,
  me: null,
  layersOn: new Set(CATEGORIES.filter((c) => c.on).map((c) => c.key).concat('aire')),
};

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(`gijon-hoy:${key}`);
    localStorage.setItem(`gijon-hoy:${key}`, value);
  } catch { /* almacenamiento bloqueado: la app funciona igual */ }
  return null;
}

// Todo el contenido del portal entra como texto, nunca como HTML.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'style') el.style.cssText = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const byId = (id) => document.getElementById(id);
const fill = (id, ...nodes) => {
  // Durante una actualización de la PWA puede convivir un HTML antiguo con este script.
  byId(id)?.replaceChildren(...nodes.flat(Infinity).filter((node) => node !== null && node !== undefined && node !== false));
};
const levelVar = (level) => `--level: var(--l${level})`;
const skeleton = () => h('div', { class: 'skeleton' });
const number = (value, digits = 0) => value.toLocaleString('es-ES', { maximumFractionDigits: digits });

const fmt = (options) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, ...options });
const fmtHour = fmt({ hour: '2-digit', minute: '2-digit' });
const fmtDay = fmt({ day: 'numeric' });
const fmtMonth = fmt({ month: 'short' });
const fmtShort = fmt({ day: 'numeric', month: 'short' });
const fmtMonthYear = fmt({ month: 'short', year: '2-digit' });
const fmtWeekday = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dayKey = (t) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);

function message(text, retry) {
  return h('div', { class: 'message' }, text, retry && h('button', { onclick: retry }, 'Reintentar'));
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const getJson = (id) => fetchJson(dataUrl(id));

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
// La web devuelve un permiso CORS por origen y la caché HTTP puede servir el de otra visita a gijon.es.
const getWebJson = (url) => fetchJson(url, { cache: 'no-store' });

async function loadAir() {
  try {
    state.air = summarizeAir(await getJson(AIR_ID));
    state.airError = false;
    state.airLoadedAt = Date.now();
  } catch (error) {
    console.warn('Calidad del aire', error);
    state.airError = true;
  }
  renderAir();
  refreshMap();
}

async function loadEvents() {
  state.eventsError = false;
  // La agenda de la web municipal es la completa; el conjunto abierto queda como reserva.
  const webRows = await getWebJson(WEB_URLS.events).catch(() => null);
  // Si falla una recarga, se conserva la agenda completa que ya hay en pantalla.
  if (webRows === null && state.agendaFromWeb && state.events) return;
  state.agendaFromWeb = webRows !== null;
  const agendaRows = webRows ?? await getJson(EVENT_IDS.agenda).catch(() => null);
  const institutional = await getJson(EVENT_IDS.institucional).catch(() => null);
  if (agendaRows === null && institutional === null) state.eventsError = true;
  else state.events = normalizeEvents(agendaRows ?? [], institutional ?? []);
  renderEvents();
}

async function loadNotices() {
  state.noticesError = false;
  try {
    state.notices = normalizeNotices(await getWebJson(WEB_URLS.notices));
    state.noticesFromWeb = true;
  } catch {
    // Si falla una recarga, se conservan los avisos vigentes que ya hay en pantalla.
    if (state.noticesFromWeb && state.notices) return;
    try {
      state.notices = normalizeNotices(await getJson(NOTICES_ID));
      state.noticesFromWeb = false;
    } catch (error) {
      console.warn('Avisos', error);
      state.noticesError = true;
    }
  }
  renderNotices();
}

async function loadWater() {
  const [tap, bathing] = await Promise.allSettled([getJson(WATER_IDS.tap), getJson(WATER_IDS.bathing)]);
  state.tap = tap.status === 'fulfilled' ? summarizeTapWater(tap.value) : null;
  state.bathing = bathing.status === 'fulfilled' ? summarizeBathing(bathing.value) : null;
  state.waterError = !state.tap && !state.bathing;
  renderWater();
  renderBeaches();
}

async function loadPlaces() {
  state.placesFailed.clear();
  await Promise.all(CATEGORIES.map(async ({ key, ids, match }) => {
    try {
      const lists = await Promise.all(ids.map(getJson));
      const rows = lists.filter(Array.isArray).flat().filter((row) => !match || match.test(plainText(row.titulo)));
      state.places[key] = normalizePlaces(rows, key);
    } catch (error) {
      console.warn(key, error);
      state.placesFailed.add(key);
    }
  }));
  renderBeaches();
  refreshMap();
}

async function loadMobility() {
  await Promise.all(MOBILITY.map(async (layer) => {
    try {
      const features = parseKml(await fetchText(kmlUrl(layer.id)));
      state.mobility[layer.key] = features.filter((f) => !layer.folders || layer.folders.test(f.folder));
    } catch (error) {
      console.warn(layer.key, error);
      state.mobility[layer.key] = [];
    }
  }));
  refreshMap();
}

function currentStation() {
  const stations = state.air ?? [];
  return stations.find((s) => String(s.id) === String(state.stationId)) ?? stations.find((s) => s.id === 1) ?? stations[0];
}

function selectStation(id) {
  state.stationId = id;
  store('station', String(id));
  renderAir();
}

function locate() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((position) => {
    state.me = { lat: position.coords.latitude, lon: position.coords.longitude };
    const nearest = [...(state.air ?? [])].sort((a, b) => distanceKm(state.me, a) - distanceKm(state.me, b))[0];
    if (nearest) state.stationId = nearest.id;
    renderAir();
    renderBeaches();
    refreshMap();
  }, () => {
    const note = byId('locate-note');
    if (note) note.textContent = 'No se pudo obtener tu ubicación.';
  }, { timeout: 10000, maximumAge: 300000 });
}

function renderAir() {
  if (state.air === null) {
    if (state.airError) {
      fill('air-hero', h('section', { class: 'block' }, message('No se han podido cargar los datos de calidad del aire.', loadAir)));
    } else {
      fill('air-hero', skeleton());
    }
    return;
  }
  const station = currentStation();
  if (!station) {
    fill('air-hero', h('section', { class: 'block' }, message('El portal no ofrece ahora lecturas recientes de calidad del aire.', loadAir)));
    fill('air-detail');
    fill('air-stations', message('Sin lecturas recientes.'));
    return;
  }
  fill('air-hero', hero(station));
  fill('air-detail', pollutants(station));
  fill('air-stations', state.air.map((s) => h('button', {
    class: 'station', style: levelVar(s.level), 'aria-pressed': String(s.id === station.id), onclick: () => selectStation(s.id),
  }, h('span', { class: 'dot' }), h('span', { class: 'st-name' }, s.name), h('span', { class: 'st-level' }, AQI_LEVELS[s.level]))));
}

function hero(station) {
  const { weather: w, pollutants: values, dominant } = station;
  const main = values[dominant];
  const unit = main.averaged ? 'de media en 24 h' : 'en la última hora';
  const ageHours = (Date.now() - station.updated) / 3600e3;
  const stats = [
    w.temp !== null && ['Temperatura', `${number(w.temp, 1)} °C`],
    w.humidity !== null && ['Humedad', `${number(w.humidity)} %`],
    w.wind !== null && ['Viento', `${number(w.wind * 3.6)} km/h`],
    w.rain !== null && ['Lluvia', `${number(w.rain, 1)} l/m²`],
  ].filter(Boolean);
  return h('section', { class: 'hero', 'data-level': station.level, style: levelVar(station.level) },
    h('div', { class: 'hero-tools' },
      h('label', { class: 'eyebrow', for: 'station-select' }, 'Calidad del aire en'),
      navigator.geolocation && h('button', { onclick: locate }, 'Usar mi ubicación'),
    ),
    h('select', {
      id: 'station-select', style: 'margin-top:8px', onchange: (event) => selectStation(event.target.value),
    }, (state.air).map((s) => h('option', { value: s.id, selected: s.id === station.id }, s.name))),
    h('p', { id: 'locate-note', class: 'measured', role: 'status' }),
    h('h2', {}, AQI_LEVELS[station.level]),
    h('p', { class: 'why' }, `La marca el ${POLLUTANT_LABELS[dominant]}: ${number(main.value)} µg/m³ ${unit}.`),
    h('div', { class: 'scale', 'aria-hidden': 'true' }, AQI_LEVELS.map((_, i) => h('i', { class: i === station.level ? 'on' : '' }))),
    h('div', { class: 'scale-ends', 'aria-hidden': 'true' }, h('span', {}, 'Mejor'), h('span', {}, 'Peor')),
    stats.length > 0 && h('dl', { class: 'weather' }, stats.map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value)))),
    lineChart({
      points: station.history, label: `${POLLUTANT_LABELS[dominant]} por hora, últimas 24 h`, unit: 'µg/m³',
      formatX: (t) => fmtHour.format(t), xLabel: 'Hora', zero: true,
    }),
    h('p', { class: 'measured' }, `Última medición: ${fmtWeekday.format(station.updated)}, ${fmtHour.format(station.updated)}.`,
      ageHours > STALE_HOURS && h('span', { class: 'warn' }, ' El dato tiene varias horas.')),
  );
}

function lineChart({ points, label, unit, digits = 0, formatX, xLabel, zero = false }) {
  if (points.length < 3) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const [W, H, PAD] = [320, 64, 5];
  const format = (value) => `${number(value, digits)}${unit ? ` ${unit}` : ''}`;
  const values = points.map((p) => p.value);
  const top = Math.max(...values);
  const bottom = zero ? 0 : Math.min(...values);
  const range = Math.max(top - bottom, zero ? 1 : 1e-6);
  const t0 = points[0].time;
  const span = Math.max(points.at(-1).time - t0, 1);
  const x = (time) => PAD + ((time - t0) / span) * (W - PAD * 2);
  const y = (value) => H - PAD - ((value - bottom) / range) * (H - PAD * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const last = points.at(-1);
  const summary = zero ? `máx. ${format(top)}` : `mín. ${format(bottom)} · máx. ${format(top)}`;
  const readout = h('span', { 'aria-hidden': 'true' }, summary);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${label}. ${summary}. Último valor: ${format(last.value)}.` });
  svg.append(
    svgEl('line', { x1: PAD, x2: W - PAD, y1: H - PAD, y2: H - PAD, stroke: 'currentColor', 'stroke-opacity': .3, 'stroke-width': 1 }),
    svgEl('path', { d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  );
  const marker = svgEl('circle', { cx: x(last.time), cy: y(last.value), r: 4, fill: 'currentColor' });
  const cross = svgEl('line', { y1: PAD, y2: H - PAD, stroke: 'currentColor', 'stroke-opacity': .5, 'stroke-width': 1, visibility: 'hidden' });
  svg.append(cross, marker);

  svg.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect();
    const time = t0 + ((event.clientX - box.left) / box.width * W - PAD) / (W - PAD * 2) * span;
    const point = points.reduce((a, b) => (Math.abs(b.time - time) < Math.abs(a.time - time) ? b : a));
    marker.setAttribute('cx', x(point.time));
    marker.setAttribute('cy', y(point.value));
    cross.setAttribute('x1', x(point.time));
    cross.setAttribute('x2', x(point.time));
    cross.setAttribute('visibility', 'visible');
    readout.textContent = `${formatX(point.time)} · ${format(point.value)}`;
  });
  svg.addEventListener('pointerleave', () => {
    marker.setAttribute('cx', x(last.time));
    marker.setAttribute('cy', y(last.value));
    cross.setAttribute('visibility', 'hidden');
    readout.textContent = summary;
  });

  return h('div', { class: 'spark' },
    h('div', { class: 'spark-head' }, h('span', {}, label), readout),
    svg,
    h('details', {}, h('summary', {}, 'Ver los datos'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, xLabel), h('th', {}, unit || 'Valor'))),
        h('tbody', {}, [...points].reverse().map((p) => h('tr', {}, h('td', {}, formatX(p.time)), h('td', {}, number(p.value, digits))))))),
  );
}

function pollutants(station) {
  const tiles = Object.entries(station.pollutants).map(([key, item]) => h('div', { class: 'tile', style: levelVar(item.level) },
    h('span', { class: 'name' }, h('span', { class: 'dot' }), POLLUTANT_LABELS[key]),
    h('b', {}, number(item.value)),
    h('small', {}, AQI_LEVELS[item.level]),
  ));
  return h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Contaminantes')),
    h('div', { class: 'tiles' }, tiles),
    h('p', { class: 'note' }, 'µg/m³. Partículas: media de 24 h; gases: última hora. Datos provisionales, cálculo orientativo.'),
  );
}

function eventWhen(event) {
  const sameDay = dayKey(event.start) === dayKey(event.end);
  if (event.ongoing) return event.allDay || !sameDay ? `Hasta el ${fmtShort.format(event.end)}` : `Hasta las ${fmtHour.format(event.end)}`;
  const date = fmtWeekday.format(event.start);
  if (!sameDay) return `Del ${fmtShort.format(event.start)} al ${fmtShort.format(event.end)}`;
  if (event.allDay) return date;
  return `${date}, ${fmtHour.format(event.start)}${event.openEnd ? '' : `–${fmtHour.format(event.end)}`}`;
}

function eventRow(event) {
  const heading = h('button', { type: 'button', class: 'event-open', onclick: () => openEvent(event) }, event.title);
  const box = event.ongoing ? new Date() : new Date(event.start);
  return h('article', { class: 'event' },
    h('div', { class: 'date-box', 'aria-hidden': 'true' }, h('b', {}, fmtDay.format(box)), h('small', {}, fmtMonth.format(box).replace('.', ''))),
    h('div', {},
      h('h3', {}, heading),
      h('p', {}, event.ongoing && h('span', { class: 'live' }, 'En curso · '), eventWhen(event)),
      event.place && h('p', {}, event.place),
    ),
  );
}

function renderEvents() {
  const officialLink = () => h('a', { href: OFFICIAL_AGENDA, rel: 'noopener', target: '_blank' }, 'agenda completa en gijon.es');
  if (state.eventsError) {
    fill('next-events', message('No se ha podido cargar la agenda.', loadEvents));
    fill('agenda-list', message('No se ha podido cargar la agenda.', loadEvents));
    return;
  }
  if (state.events === null) {
    fill('next-events', skeleton());
    fill('agenda-list', skeleton());
    return;
  }
  const short = state.events.filter((e) => !isLongRunning(e));
  const pool = short.length ? short : state.events;
  const zone = state.prefs.district;
  const local = zone ? pool.filter((e) => inDistrict(e.district, zone)).slice(0, 3) : [];
  const rest = pool.filter((e) => !local.includes(e)).slice(0, local.length ? 2 : 4);
  fill('next-events', pool.length
    ? [
      local.length > 0 && h('h3', { class: 'subhead' }, `En tu zona · ${districtLabel(zone)}`),
      local.map(eventRow),
      local.length > 0 && h('h3', { class: 'subhead' }, 'En todo Gijón'),
      rest.map(eventRow),
    ]
    : h('div', { class: 'message' }, 'No hay actos próximos. Consulta la ', officialLink(), '.'));
  fill('agenda-notice', state.agendaFromWeb
    ? h('p', { class: 'note first' }, 'Fuente: agenda de la web municipal y agenda institucional.')
    : h('p', { class: 'callout' }, 'No se ha podido cargar la agenda de la web municipal. Se muestran los datos abiertos, que están incompletos. Consulta la ', officialLink(), '.'));
  renderAgendaFilters();
  renderAgendaList();
}

const normalizeText = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function agendaRange(when) {
  const now = new Date();
  const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const DAY = 24 * 3600e3;
  if (when === 'today') return [now.getTime(), dayStart(now) + DAY - 1];
  if (when === 'week') return [now.getTime(), now.getTime() + 7 * DAY];
  if (when === 'weekend') {
    const day = now.getDay();
    const toSaturday = day === 0 ? -1 : 6 - day;
    const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + toSaturday).getTime();
    return [Math.max(saturday, now.getTime()), saturday + 2 * DAY - 1];
  }
  return null;
}

function renderAgendaFilters() {
  const filter = state.agendaFilter;
  const update = (changes) => {
    Object.assign(filter, changes);
    state.agendaLimit = 40;
    renderAgendaList();
  };
  const counts = new Map();
  state.events.forEach((e) => e.topic && counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1));
  const when = [['all', 'Todo'], ['today', 'Hoy'], ['week', '7 días'], ['weekend', 'Fin de semana']];
  fill('agenda-filters',
    h('input', { type: 'search', placeholder: 'Buscar acto o lugar', 'aria-label': 'Buscar en la agenda', value: filter.q, oninput: (e) => update({ q: e.target.value }) }),
    h('select', { 'aria-label': 'Tema', onchange: (e) => update({ topic: e.target.value }) },
      h('option', { value: '' }, 'Todos los temas'),
      [...counts].sort((a, b) => b[1] - a[1]).map(([topic, count]) => h('option', { value: topic, selected: topic === filter.topic }, `${topic} (${count})`))),
    state.prefs.district && h('button', {
      type: 'button', class: 'zone-toggle', 'aria-pressed': String(filter.zone),
      onclick: (event) => {
        event.currentTarget.setAttribute('aria-pressed', String(!filter.zone));
        update({ zone: !filter.zone });
      },
    }, `Solo en mi zona · ${districtLabel(state.prefs.district)}`),
    h('div', { class: 'segments', role: 'group', 'aria-label': 'Cuándo' }, when.map(([value, label]) => h('button', {
      'aria-pressed': String(filter.when === value),
      onclick: (event) => {
        event.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === event.currentTarget)));
        update({ when: value });
      },
    }, label))),
  );
}

function renderAgendaList() {
  const { q, when, topic, zone } = state.agendaFilter;
  const query = normalizeText(q.trim());
  const range = agendaRange(when);
  const matches = state.events.filter((e) => (!topic || e.topic === topic)
    && (!zone || !state.prefs.district || inDistrict(e.district, state.prefs.district))
    && (!query || normalizeText(`${e.title} ${e.place} ${e.type}`).includes(query))
    && (!range || occursBetween(e, range[0], range[1])));
  if (!matches.length) {
    fill('agenda-list', h('div', { class: 'message' }, 'No hay actos con esos filtros.'));
    return;
  }
  // Lo largo que ya está en curso va aparte para no ocupar el principio de la lista cronológica.
  const running = matches.filter((e) => e.ongoing && isLongRunning(e));
  const timeline = matches.filter((e) => !(e.ongoing && isLongRunning(e)));
  const shown = timeline.slice(0, state.agendaLimit);
  fill('agenda-list',
    h('p', { class: 'count', role: 'status' }, `${matches.length} ${matches.length === 1 ? 'acto' : 'actos'}`),
    running.length > 0 && h('details', { class: 'running' },
      h('summary', {}, `Exposiciones y actividades en curso (${running.length})`),
      running.map(eventRow)),
    shown.map(eventRow),
    when === 'today' && !timeline.length && h('div', { class: 'message' }, 'Hoy no quedan más actos con fecha concreta.',
      h('button', {
        type: 'button',
        onclick: () => {
          state.agendaFilter.when = 'week';
          renderAgendaFilters();
          renderAgendaList();
        },
      }, 'Ver los próximos 7 días')),
    timeline.length > shown.length && h('button', { class: 'more', onclick: () => { state.agendaLimit += 40; renderAgendaList(); } }, `Ver más (${timeline.length - shown.length})`),
  );
}

function noticeWhen(notice) {
  const now = Date.now();
  if (notice.start && notice.start > now) return notice.end ? `Del ${fmtShort.format(notice.start)} al ${fmtShort.format(notice.end)}` : `Desde el ${fmtShort.format(notice.start)}`;
  return notice.end ? `Hasta el ${fmtShort.format(notice.end)}` : 'Vigente';
}

function renderNotices() {
  if (state.noticesError) {
    fill('notices', message('No se han podido cargar los avisos.', loadNotices));
    return;
  }
  if (state.notices === null) {
    fill('notices', skeleton());
    return;
  }
  if (!state.notices.length) {
    fill('notices', h('div', { class: 'message' }, state.noticesFromWeb ? 'No hay avisos de movilidad vigentes.' : 'No se ha podido consultar la web municipal y los datos abiertos no tienen avisos vigentes.'));
    return;
  }
  const myLines = state.prefs.lines;
  // Primero los avisos que afectan a tus líneas; el resto mantiene su orden.
  const sorted = [...state.notices].sort((a, b) => Number(linesAffected(b, myLines).length > 0) - Number(linesAffected(a, myLines).length > 0));
  const visible = state.noticesExpanded ? sorted : sorted.slice(0, 3);
  const anyMine = myLines.length > 0 && sorted.some((n) => linesAffected(n, myLines).length);
  fill('notices',
    myLines.length > 0 && !anyMine && h('p', { class: 'note first' }, 'Ningún aviso vigente afecta a tus líneas.'),
    visible.map((notice) => {
      const mine = linesAffected(notice, myLines);
      return h('article', { class: mine.length ? 'notice mine' : 'notice' },
        h('h3', {}, notice.url ? h('a', { href: notice.url, rel: 'noopener', target: '_blank' }, notice.title) : notice.title),
        mine.length > 0 && h('p', { class: 'mine-tag' }, `Afecta a ${mine.length > 1 ? 'tus líneas' : 'tu línea'} ${mine.join(', ')}`),
        h('p', {}, [notice.type, noticeWhen(notice)].filter(Boolean).join(' · ')),
        notice.lines.length > 8
          ? h('p', { class: 'lines-text' }, `${notice.lines.length} líneas de bus afectadas`)
          : notice.lines.length > 0 && h('div', { class: 'lines', 'aria-label': 'Líneas afectadas' },
            notice.lines.map((line) => h('span', { class: mine.includes(line) ? 'mine' : '' }, line))),
      );
    }),
    state.notices.length > 3 && h('button', {
      class: 'more',
      onclick: () => { state.noticesExpanded = !state.noticesExpanded; renderNotices(); },
    }, state.noticesExpanded ? 'Ver menos' : `Ver todos (${state.notices.length})`),
  );
}

function bathText(bath) {
  return `${bath.status === 'warn' ? 'No recomendable' : 'Apta para el baño'} · ${fmtShort.format(bath.date)}`;
}

function renderWater() {
  if (state.waterError) {
    fill('water-summary', message('No se han podido cargar los datos del agua.', loadWater));
    fill('water-view', message('No se han podido cargar los datos del agua.', loadWater));
    return;
  }
  const { tap, bathing } = state;
  if (!tap && !bathing) {
    fill('water-summary', skeleton());
    fill('water-view', skeleton());
    return;
  }
  const measured = bathing?.zones.filter((z) => z.status) ?? [];
  const safe = measured.filter((z) => z.status === 'ok').length;
  fill('water-summary',
    tap && h('p', { class: 'water-row' }, h('strong', {}, 'Grifo. '), `Análisis de ${tap.month}: cloro libre ${tap.params[0].raw} mg/l, pH ${tap.params[1].raw}.`),
    bathing && h('p', { class: 'water-row' }, h('strong', {}, 'Baño. '), `Último análisis, ${fmtShort.format(bathing.latest)}: ${safe} de ${measured.length} zonas aptas.`),
  );
  fill('water-view', tap ? tapSection(tap) : null, bathing ? bathingSection(bathing, measured) : null);
}

function tapSection(tap) {
  const main = tap.params.filter((p) => p.main && p.raw);
  const zero = tap.bacteria.every((b) => b.value === 0);
  const positive = tap.bacteria.filter((b) => b.value !== 0 && b.value !== null);
  const charted = tap.params.filter((p) => p.series.length >= 3);
  const chart = h('div', {});
  const drawChart = () => {
    const param = charted.find((p) => p.key === state.waterParam) ?? charted[0];
    chart.replaceChildren(...[param && lineChart({
      points: param.series, label: param.label, unit: param.unit, digits: 3,
      formatX: (t) => fmtMonthYear.format(t), xLabel: 'Mes',
    })].filter(Boolean));
  };
  drawChart();
  return h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Agua del grifo')),
    h('p', { class: 'sub' }, `Análisis de ${tap.month} de ${tap.year} · ${tap.point}`),
    h('p', { class: 'callout' }, 'El portal lo etiqueta como «tiempo real», pero publica un análisis al mes.'),
    h('div', { class: 'tiles' }, main.map((p) => h('div', { class: 'tile' },
      h('span', { class: 'name' }, p.label), h('b', {}, p.raw), h('small', {}, p.unit || 'Sin unidad')))),
    h('p', { class: 'water-row' }, h('strong', {}, 'Bacterias indicadoras. '), zero
      ? `0 en la muestra: ${tap.bacteria.map((b) => b.label).join(', ')}.`
      : (positive.length ? positive.map((b) => `${b.label}: ${number(b.value)}`).join(', ') : 'Sin datos en este análisis.')),
    charted.length > 0 && h('label', { class: 'field' }, 'Evolución de ',
      h('select', { onchange: (e) => { state.waterParam = e.target.value; drawChart(); } },
        charted.map((p) => h('option', { value: p.key, selected: p.key === state.waterParam }, p.label)))),
    chart,
    h('details', { class: 'all' }, h('summary', {}, 'Todos los parámetros'),
      h('table', { class: 'data' }, h('tbody', {},
        tap.params.filter((p) => p.raw).map((p) => h('tr', {}, h('th', { scope: 'row' }, p.label), h('td', {}, `${p.raw}${p.unit ? ` ${p.unit}` : ''}`))),
        tap.germs !== null && h('tr', {}, h('th', { scope: 'row' }, 'Gérmenes totales a 22 °C'), h('td', {}, number(tap.germs))),
      ))),
    h('p', { class: 'note' }, 'El portal no publica las unidades: se indican las habituales en estos análisis. «<» significa por debajo del límite de detección.'),
  );
}

function bathingSection(bathing, measured) {
  const daysOld = (Date.now() - bathing.latest) / (24 * 3600e3);
  return h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Agua de baño')),
    h('p', { class: 'sub' }, `Último análisis publicado: ${fmtShort.format(bathing.latest)} · ${bathing.samples} muestras este año`),
    daysOld > 21 && h('p', { class: 'callout' }, 'Este resultado es de hace varias semanas: los análisis se publican durante la temporada de baño y no indican el estado actual del agua.'),
    measured.map((zone) => h('div', { class: `zone ${zone.status}` },
      h('span', { class: 'bath-mark', 'aria-hidden': 'true' }, zone.status === 'warn' ? '!' : '✓'),
      h('span', { class: 'st-name' }, zone.label),
      h('span', { class: 'st-level' }, zone.status === 'warn' ? 'No recomendable' : 'Apta',
        zone.warnings > 0 && h('small', {}, ` · ${zone.warnings} de ${zone.measured} no recomendables`)),
    )),
  );
}

// Si la versión reducida falla, se prueba una vez con la original.
function imageFallback(event, place, giveUp) {
  const img = event.target;
  if (place.imageFull && img.src !== place.imageFull && !img.dataset.retried) {
    img.dataset.retried = '1';
    img.src = place.imageFull;
  } else {
    giveUp();
  }
}

function renderBeaches() {
  const beaches = state.places.playas;
  if (!beaches) {
    fill('beaches', state.placesFailed.has('playas') ? message('No se han podido cargar las playas.', loadPlaces) : skeleton());
    return;
  }
  // El conjunto «Playas» incluye también una ficha de zonas para mascotas, que sigue en el mapa.
  const sorted = beaches.filter((b) => !/mascotas/i.test(b.title)).sort((a, b) => (reference() ? distanceKm(reference(), a) - distanceKm(reference(), b) : a.lon - b.lon));
  fill('beaches', sorted.map((beach) => h('button', { class: 'beach', onclick: () => focusPlace(beach) },
    beach.image ? h('img', { class: 'photo', src: beach.image, alt: '', loading: 'lazy', decoding: 'async', width: 240, height: 124, referrerpolicy: 'no-referrer', onerror: (e) => imageFallback(e, beach, () => e.target.replaceWith(h('span', { class: 'photo' }))) }) : h('span', { class: 'photo' }),
    h('div', {},
      h('h3', {}, beach.title),
      h('p', {}, reference() ? `A ${number(distanceKm(reference(), beach), 1)} km` : beach.address || 'Gijón'),
      bathingForBeach(state.bathing, beach.title) && h('p', { class: 'bath' }, bathText(bathingForBeach(state.bathing, beach.title))),
    ),
  )));
}

// Personalización: se guarda solo en este dispositivo.
function loadPrefs() {
  const empty = { lines: [], district: '', point: null };
  try {
    const saved = JSON.parse(store('prefs') || '{}');
    const point = saved.point && Number.isFinite(saved.point.lat) && Number.isFinite(saved.point.lon) ? { lat: saved.point.lat, lon: saved.point.lon } : null;
    return {
      lines: Array.isArray(saved.lines) ? saved.lines.filter((l) => typeof l === 'string' && /^[A-Z]\d+$/.test(l)).slice(0, 40) : [],
      district: DISTRICTS.includes(saved.district) ? saved.district : '',
      point,
    };
  } catch {
    return empty;
  }
}

const savePrefs = () => store('prefs', JSON.stringify(state.prefs));
const allPlaces = () => Object.values(state.places).flat();
const zonePoint = () => state.prefs.point ?? districtCentroids(allPlaces())[state.prefs.district] ?? null;
const reference = () => state.me ?? zonePoint();

function knownLines() {
  const names = new Map();
  allPlaces().forEach((place) => place.lineNames?.forEach(([code, name]) => { if (!names.get(code)) names.set(code, name); }));
  (state.notices ?? []).forEach((notice) => notice.lines.forEach((code) => { if (!names.has(code)) names.set(code, ''); }));
  state.prefs.lines.forEach((code) => { if (!names.has(code)) names.set(code, ''); });
  return [...names].sort(([a], [b]) => compareLines(a, b));
}

function prefsChanged() {
  savePrefs();
  renderPersonal();
  renderPrefsSheet();
  renderNotices();
  renderAir();
  if (state.events) renderEvents();
  renderBeaches();
}

function setZone(district, point = null) {
  state.prefs.district = district;
  state.prefs.point = district ? point : null;
  const zone = zonePoint();
  if (zone && state.air?.length) {
    const nearest = [...state.air].sort((a, b) => distanceKm(zone, a) - distanceKm(zone, b))[0];
    state.stationId = nearest.id;
    store('station', String(nearest.id));
  }
  if (!district) state.agendaFilter.zone = false;
  prefsChanged();
}

function useLocationAsZone() {
  const note = byId('zone-note');
  if (note) note.textContent = 'Buscando tu ubicación…';
  navigator.geolocation.getCurrentPosition((position) => {
    // Se redondea a unos 100 m: basta para la zona y no guarda tu posición exacta.
    const point = { lat: Math.round(position.coords.latitude * 1000) / 1000, lon: Math.round(position.coords.longitude * 1000) / 1000 };
    const district = nearestDistrict(point, districtCentroids(allPlaces()));
    if (!district) {
      if (note) note.textContent = 'Aún se están cargando los datos; inténtalo en unos segundos.';
      return;
    }
    setZone(district, point);
  }, () => {
    if (note) note.textContent = 'No se pudo obtener tu ubicación. Elige un distrito.';
  }, { timeout: 10000, maximumAge: 300000 });
}

function toggleLine(code) {
  const lines = new Set(state.prefs.lines);
  if (lines.has(code)) lines.delete(code);
  else lines.add(code);
  state.prefs.lines = [...lines].sort(compareLines);
  prefsChanged();
}

function openPrefs() {
  renderPrefsSheet();
  byId('prefs-sheet')?.showModal();
}

function zoneText() {
  const { district, point } = state.prefs;
  return point ? `cerca de ti (${districtLabel(district)})` : districtLabel(district);
}

function renderPersonal() {
  const { lines, district } = state.prefs;
  if (!lines.length && !district) {
    fill('personal', h('div', { class: 'personal-cta' },
      h('div', {}, h('strong', {}, 'Personaliza tu portada'), h('p', {}, 'Elige tus líneas de bus y tu zona para ver primero lo que te afecta.')),
      h('button', { type: 'button', onclick: openPrefs }, 'Empezar')));
    return;
  }
  fill('personal', h('div', { class: 'personal-row' },
    h('p', {},
      district && h('span', {}, h('strong', {}, 'Tu zona: '), zoneText()),
      lines.length > 0 && h('span', {}, h('strong', {}, lines.length > 1 ? 'Tus líneas: ' : 'Tu línea: '), lines.join(', '))),
    h('button', { type: 'button', class: 'link-btn', onclick: openPrefs }, 'Editar')));
}

function renderPrefsSheet() {
  const sheet = byId('prefs-sheet');
  if (!sheet) return;
  const scroll = sheet.scrollTop;
  const { lines, district, point } = state.prefs;
  const all = knownLines();
  const names = new Map(all);
  fill('prefs-sheet',
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Personalizar'), h('button', { type: 'button', onclick: () => sheet.close() }, 'Hecho')),
    h('div', { class: 'sheet-body' },
      h('section', { class: 'sheet-group' },
        h('div', { class: 'sheet-group-head' }, h('h3', {}, 'Mi zona'),
          district && h('button', { type: 'button', onclick: () => setZone('') }, 'Quitar')),
        h('div', { class: 'district-grid', role: 'group', 'aria-label': 'Distrito' }, DISTRICTS.map((d) => h('button', {
          type: 'button', 'aria-pressed': String(district === d && !point),
          onclick: () => setZone(district === d && !point ? '' : d),
        }, districtLabel(d)))),
        navigator.geolocation && h('button', { type: 'button', class: 'more', 'aria-pressed': String(Boolean(point)), onclick: useLocationAsZone },
          point ? `Usando tu ubicación (${districtLabel(district)}) · Actualizar` : 'Usar mi ubicación'),
        h('p', { class: 'note', id: 'zone-note', role: 'status' }, 'Tu zona y tus líneas se guardan solo en este dispositivo.')),
      h('section', { class: 'sheet-group' },
        h('div', { class: 'sheet-group-head' }, h('h3', {}, 'Mis líneas de bus'),
          lines.length > 0 && h('button', { type: 'button', onclick: () => { state.prefs.lines = []; prefsChanged(); } }, 'Quitar todas')),
        all.length
          ? h('div', { class: 'line-grid', role: 'group', 'aria-label': 'Líneas de bus' }, all.map(([code, name]) => h('button', {
            type: 'button', 'aria-pressed': String(lines.includes(code)), title: name || code, 'aria-label': name ? `${code}, ${name}` : code,
            onclick: () => toggleLine(code),
          }, code)))
          : h('p', { class: 'note' }, 'Cargando líneas…'),
        lines.length > 0 && h('ul', { class: 'line-list' }, lines.map((code) => h('li', {}, h('strong', {}, code), names.get(code) ? ` ${names.get(code)}` : '')))),
    ),
  );
  sheet.scrollTop = scroll;
}

// Tiempo y mar
async function loadWeather() {
  const day = 86400e3;
  const now = Date.now();
  const [forecast, marine, ...tides] = await Promise.allSettled([
    fetchJson(WEATHER_URLS.forecast),
    fetchJson(WEATHER_URLS.marine),
    ...[-1, 0, 1, 2].map((offset) => fetchJson(tideUrl(now + offset * day))),
  ]);
  if (forecast.status === 'fulfilled') state.weather = summarizeWeather(forecast.value) ?? state.weather;
  if (marine.status === 'fulfilled') state.marine = summarizeMarine(marine.value) ?? state.marine;
  const events = parseTides(tides.filter((t) => t.status === 'fulfilled').map((t) => t.value));
  if (events.length) state.tides = events;
  state.weatherError = forecast.status === 'rejected';
  renderWeather();
  renderWeatherView();
}

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const fmtWeekdayName = fmt({ weekday: 'long' });
function relativeDay(ms) {
  const now = Date.now();
  if (dayKey(ms) === dayKey(now)) return 'Hoy';
  if (dayKey(ms) === dayKey(now + 86400e3)) return 'Mañana';
  return capital(fmtWeekdayName.format(ms));
}
const hoursMinutes = (seconds) => `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
const stats = (pairs) => h('dl', { class: 'weather wx-grid' },
  pairs.filter((pair) => pair && pair[1]).map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value))));
const block = (title, ...children) => h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, title)), ...children);
const openMeteoLink = () => h('a', { href: 'https://open-meteo.com/', rel: 'noopener', target: '_blank' }, 'Weather data by Open-Meteo.com');

function tideSummary() {
  const now = state.tides && tideAt(state.tides, Date.now());
  if (!now) return null;
  return `${now.rising ? 'Subiendo' : 'Bajando'} · ${now.next.type === 'high' ? 'pleamar' : 'bajamar'} a las ${fmtHour.format(now.next.time)}`;
}

function wxIcon(code, isDay = true, size = '') {
  const key = weatherIcon(code, isDay);
  if (!key) return null;
  const span = h('span', { class: `wx-ic wx-${key} ${size}`.trim(), 'aria-hidden': 'true' });
  span.innerHTML = iconSvg(key); // Solo constantes de icons.js.
  return span;
}

function weatherNow(w) {
  return h('div', { class: 'wx-now' },
    wxIcon(w.current.code, w.current.isDay, 'big'),
    h('b', { class: 'wx-temp' }, `${number(w.current.temp)}°`),
    h('div', {},
      h('p', { class: 'wx-text' }, w.current.text || 'Ahora'),
      h('p', { class: 'wx-sub' }, [
        w.current.feels !== null && `Sensación ${number(w.current.feels)}°`,
        w.today.max !== null && `Máx. ${number(w.today.max)}°`,
        w.today.min !== null && `Mín. ${number(w.today.min)}°`,
      ].filter(Boolean).join(' · '))));
}

function renderWeather() {
  const { weather: w, marine: m } = state;
  if (!w) {
    fill('weather', state.weatherError ? message('No se ha podido cargar el tiempo.', loadWeather) : skeleton());
    return;
  }
  const tide = tideSummary();
  const row = (label, value) => h('li', {}, h('span', {}, label), h('b', {}, value));
  fill('weather',
    weatherNow(w),
    h('ul', { class: 'wx-summary' },
      w.today.rain !== null && row('Lluvia hoy', `${number(w.today.rain)} %`),
      w.current.wind !== null && row('Viento', `${number(w.current.wind)} km/h ${w.current.dir}`.trim()),
      tide && row('Marea', tide),
      m && m.wave !== null && row('Mar', `olas de ${number(m.wave, 1)} m${m.sst !== null ? ` · agua a ${number(m.sst)} °C` : ''}`)),
    h('p', { class: 'note' }, openMeteoLink(), state.tides ? ' · Mareas: Instituto Hidrográfico de la Marina' : ''),
  );
}

function tidesBlock(events, now) {
  const current = tideAt(events, now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  const to = from + 86400e3;
  const curve = tideCurve(events, from, to);
  const today = events.filter((e) => e.time >= from && e.time < to);
  const highs = today.filter((e) => e.type === 'high').map((e) => e.height);
  const lows = today.filter((e) => e.type === 'low').map((e) => e.height);
  const range = highs.length && lows.length ? Math.max(...highs) - Math.min(...lows) : null;
  const groups = new Map();
  events.filter((e) => e.time >= from && e.time < from + 3 * 86400e3).forEach((e) => {
    const key = dayKey(e.time);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  return block('Mareas',
    current && h('div', { class: 'tide-now' },
      h('b', {}, current.rising ? 'Subiendo' : 'Bajando'),
      h('span', {}, `${current.next.type === 'high' ? 'Pleamar' : 'Bajamar'} a las ${fmtHour.format(current.next.time)}, ${number(current.next.height, 1)} m`),
      h('small', {}, `Altura ahora: ${number(current.height, 1)} m aprox.`)),
    curve.length > 2 && lineChart({ points: curve, label: 'Altura de la marea hoy', unit: 'm', digits: 1, formatX: (t) => fmtHour.format(t), xLabel: 'Hora' }),
    h('div', { class: 'tide-days' }, [...groups.values()].map((list) => h('div', { class: 'tide-day' },
      h('h3', { class: 'subhead' }, relativeDay(list[0].time)),
      h('ul', {}, list.map((e) => h('li', { class: e.time < now ? 'past' : '' },
        h('span', { class: `tide-kind ${e.type}` }, e.type === 'high' ? 'Pleamar' : 'Bajamar'),
        h('b', {}, fmtHour.format(e.time)),
        h('span', {}, `${number(e.height, 2)} m`))))))),
    range !== null && h('p', { class: 'note' }, `Diferencia entre la pleamar y la bajamar de hoy: ${number(range, 1)} m.`),
    h('p', { class: 'note' }, 'Predicción oficial del Instituto Hidrográfico de la Marina para el puerto de Gijón. Alturas sobre el cero hidrográfico del puerto; la altura actual es una aproximación. El viento y la presión pueden alterar el nivel real.'),
  );
}

function seaBlock(m) {
  return block('Mar',
    stats([
      m.wave !== null && ['Olas', `${number(m.wave, 1)} m`],
      m.period !== null && ['Periodo', `${number(m.period)} s`],
      m.dir && ['Dirección', `del ${m.dir}`],
      m.swell !== null && ['Mar de fondo', `${number(m.swell, 1)} m${m.swellPeriod !== null ? ` · ${number(m.swellPeriod)} s` : ''}`],
      m.windWave !== null && ['Mar de viento', `${number(m.windWave, 1)} m`],
      m.sst !== null && ['Agua', `${number(m.sst)} °C`],
    ]),
    m.days.length > 0 && h('table', { class: 'data sea-days' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Día'), h('th', {}, 'Ola máx.'), h('th', {}, 'Periodo'), h('th', {}, 'Dirección'))),
      h('tbody', {}, m.days.map((d) => h('tr', {},
        h('th', { scope: 'row' }, relativeDay(d.date)),
        h('td', {}, `${number(d.wave, 1)} m`),
        h('td', {}, d.period !== null ? `${number(d.period)} s` : ''),
        h('td', {}, d.dir))))),
    h('p', { class: 'note' }, 'En aguas abiertas frente a Gijón, a unos 16 km de la costa. No apto para navegación.'),
  );
}

function sunMoonBlock(w, now) {
  const moon = moonPhase(now);
  return block('Sol y luna',
    stats([
      ['Salida del sol', w.today.sunrise],
      ['Puesta del sol', w.today.sunset],
      w.today.daylight !== null && ['Horas de luz', hoursMinutes(w.today.daylight)],
      ['Luna', moon.name],
      ['Iluminada', `${number(moon.illumination * 100)} %`],
      moon.tides && ['Mareas', moon.tides === 'vivas' ? 'Vivas' : 'Muertas'],
    ]),
    moon.tides && h('p', { class: 'note' }, 'Mareas vivas o muertas: estimación según la fase lunar.'),
  );
}

function renderWeatherView() {
  const { weather: w, marine: m, tides } = state;
  if (!w && !tides) {
    fill('weather-view', state.weatherError ? message('No se ha podido cargar el tiempo.', loadWeather) : skeleton());
    return;
  }
  const now = Date.now();
  fill('weather-view',
    w && block('Ahora',
      weatherNow(w),
      stats([
        w.current.humidity !== null && ['Humedad', `${number(w.current.humidity)} %`],
        w.current.pressure !== null && ['Presión', `${number(w.current.pressure)} hPa`],
        w.current.cloud !== null && ['Nubes', `${number(w.current.cloud)} %`],
        w.current.wind !== null && ['Viento', `${number(w.current.wind)} km/h ${w.current.dir}`.trim()],
        w.current.gusts !== null && ['Rachas', `${number(w.current.gusts)} km/h`],
        w.current.precip !== null && ['Lluvia ahora', `${number(w.current.precip, 1)} mm`],
        w.today.uv !== null && ['Índice UV hoy', number(w.today.uv)],
      ])),
    w && w.hours.length > 2 && block('Próximas 24 horas',
      lineChart({ points: w.hours.map((p) => ({ time: p.time, value: p.temp })), label: 'Temperatura', unit: '°C', formatX: (t) => fmtHour.format(t), xLabel: 'Hora' }),
      h('div', { class: 'wx-strip' }, w.hours.filter((_, i) => i % 2 === 0).map((p) => h('div', {},
        h('small', {}, fmtHour.format(p.time)),
        wxIcon(p.code, p.isDay),
        h('b', {}, `${number(p.temp)}°`),
        h('small', {}, weatherText(p.code)),
        p.rain !== null && h('small', {}, `Lluvia ${number(p.rain)} %`),
        p.wind !== null && h('small', {}, `${number(p.wind)} km/h ${p.dir}`.trim()))))),
    w && w.days.length > 0 && block('Próximos 7 días',
      h('div', { class: 'days' }, w.days.map((d) => h('div', { class: 'day' },
        wxIcon(d.code, true, 'day-ic') ?? h('span', {}),
        h('div', {}, h('strong', {}, relativeDay(d.date)), h('small', {}, d.text)),
        h('div', { class: 'day-rain' }, d.rain !== null ? `${number(d.rain)} %` : '', d.rainSum ? h('small', {}, `${number(d.rainSum, 1)} mm`) : null),
        h('div', { class: 'day-wind' }, d.wind !== null ? `${number(d.wind)} km/h` : '', h('small', {}, d.dir)),
        h('div', { class: 'day-temp' }, h('b', {}, d.max !== null ? `${number(d.max)}°` : ''), h('span', {}, d.min !== null ? `${number(d.min)}°` : '')))))),
    tides && tidesBlock(tides, now),
    m && seaBlock(m),
    w && sunMoonBlock(w, now),
    h('p', { class: 'credits' }, 'Tiempo y mar: ', openMeteoLink(), ' (CC BY 4.0), con modelos de ECMWF, DWD, NOAA y Météo-France y datos de Copernicus Marine. Mareas: © Instituto Hidrográfico de la Marina. Fase lunar: cálculo astronómico aproximado.'),
  );
}

// Ficha de un acto: calendario y compartir
const slugify = (text) => normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'acto';

function downloadIcs(event, status) {
  const url = URL.createObjectURL(new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = h('a', { href: url, download: `${slugify(event.title)}.ics` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  status.textContent = 'Archivo del acto descargado: ábrelo para añadirlo a tu calendario.';
}

async function shareEvent(event, status) {
  const url = event.url || OFFICIAL_AGENDA;
  const text = [event.title, eventWhen(event), event.place].filter(Boolean).join(' · ');
  try {
    if (navigator.share) {
      await navigator.share({ title: event.title, text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    status.textContent = 'Copiado: pégalo donde quieras compartirlo.';
  } catch (error) {
    if (error?.name !== 'AbortError') status.textContent = 'No se ha podido compartir.';
  }
}

function openEvent(event) {
  const sheet = byId('event-sheet');
  if (!sheet) return;
  const status = h('p', { class: 'note', role: 'status' });
  fill('event-sheet',
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Detalles'), h('button', { type: 'button', onclick: () => sheet.close() }, 'Cerrar')),
    h('div', { class: 'sheet-body' },
      event.image && h('img', { class: 'event-img', src: event.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }),
      (event.topic || event.type) && h('p', { class: 'muted' }, [event.topic, event.type].filter(Boolean).join(' · ')),
      h('h3', { class: 'event-title' }, event.title),
      h('p', {}, event.ongoing && h('span', { class: 'live' }, 'En curso · '), eventWhen(event)),
      (event.place || event.address) && h('p', { class: 'muted' }, [event.place, event.address].filter(Boolean).join(' · ')),
      h('div', { class: 'event-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => downloadIcs(event, status) }, 'Añadir al calendario'),
        h('a', { class: 'btn', href: googleCalendarUrl(event), rel: 'noopener', target: '_blank' }, 'Google Calendar'),
        h('button', { type: 'button', onclick: () => shareEvent(event, status) }, 'Compartir'),
        event.url && h('a', { class: 'btn', href: event.url, rel: 'noopener', target: '_blank' }, 'Ver en gijon.es')),
      status),
  );
  sheet.scrollTop = 0;
  sheet.showModal();
}

// Mapa
let map = null;
let layers = {};
const markers = new Map();
let meMarker = null;
let pendingFocus = null;

function initMap() {
  if (map || !window.L) return;
  const zone = zonePoint();
  map = L.map('map', { zoomControl: true }).setView(zone ? [zone.lat, zone.lon] : CENTER, zone ? 14 : 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Datos: Ayto. de Gijón (CC BY 4.0)',
  }).addTo(map);
  refreshMap();
}

function pin(color, extra = '', glyph = '') {
  return L.divIcon({ className: '', html: `<span class="pin ${extra}" style="--c:${color}">${glyph}</span>`, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });
}

function directions(item) {
  return h('a', { class: 'go', rel: 'noopener', target: '_blank', href: `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}` }, 'Cómo llegar');
}

function placePopup(place, label) {
  return h('div', { class: 'pop' },
    place.image && h('img', { src: place.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => imageFallback(e, place, () => e.target.remove()) }),
    h('small', {}, label),
    h('h3', {}, place.title),
    place.address && h('p', {}, place.address),
    place.schedule && h('p', {}, `Horario: ${place.schedule}`),
    place.buses.length > 0 && h('p', {}, `Bus: ${place.buses.join(', ')}`),
    place.description && h('p', { class: 'desc' }, place.description),
    place.category === 'playas' && bathingForBeach(state.bathing, place.title) && h('p', {}, `Agua: ${bathText(bathingForBeach(state.bathing, place.title))}`),
    place.phone && h('p', {}, h('a', { href: `tel:${place.phone.replace(/[^+\d]/g, '')}` }, place.phone)),
    place.web && h('p', {}, h('a', { href: place.web, rel: 'noopener', target: '_blank' }, 'Web')),
    directions(place),
  );
}

function mobilityPopup(layer, feature) {
  const generic = !feature.name || /^(taxis|carril bici|en superficie)$/i.test(feature.name);
  const where = feature.point ?? feature.line[Math.floor(feature.line.length / 2)];
  return h('div', { class: 'pop' },
    h('small', {}, layer.label),
    h('h3', {}, generic ? (feature.folder || layer.label) : feature.name),
    feature.description && h('p', {}, feature.description),
    feature.point && directions(where),
    h('p', { class: 'pop-note' }, 'Datos del Plan de Movilidad (PMUS); pueden no estar al día.'),
  );
}

function airPopup(station) {
  return h('div', { class: 'pop' },
    h('small', {}, 'Estación de calidad del aire'),
    h('h3', {}, station.name),
    h('p', {}, h('strong', {}, AQI_LEVELS[station.level])),
    h('p', {}, `Última medición: ${fmtHour.format(station.updated)}`),
  );
}

function setLayer(key, on) {
  if (!map || !layers[key]) return;
  if (on) layers[key].addTo(map);
  else layers[key].remove();
}

function refreshMap() {
  renderChips();
  if (!map) return;
  Object.values(layers).forEach((layer) => layer.remove());
  layers = {};
  markers.clear();

  for (const category of CATEGORIES) {
    const group = L.layerGroup();
    for (const place of state.places[category.key] ?? []) {
      const marker = L.marker([place.lat, place.lon], { icon: pin(category.color, '', category.glyph), title: `${category.label}: ${place.title}`, alt: `${category.label}: ${place.title}` })
        .bindPopup(() => placePopup(place, category.label));
      marker.addTo(group);
      markers.set(place.id, marker);
    }
    layers[category.key] = group;
  }
  const airGroup = L.layerGroup();
  for (const station of state.air ?? []) {
    if (station.lat === null || station.lon === null) continue;
    L.marker([station.lat, station.lon], { icon: pin(`var(--l${station.level})`, 'air'), title: `Aire: ${station.name}`, alt: `Aire: ${station.name}` })
      .bindPopup(() => airPopup(station)).addTo(airGroup);
  }
  layers.aire = airGroup;
  for (const layer of MOBILITY) {
    const group = L.layerGroup();
    for (const feature of state.mobility[layer.key] ?? []) {
      const popup = () => mobilityPopup(layer, feature);
      if (feature.line) {
        L.polyline(feature.line.map((p) => [p.lat, p.lon]), {
          color: layer.color, weight: 4, opacity: .85, dashArray: /compartida/i.test(feature.folder) ? '2 7' : layer.dash,
        }).bindPopup(popup).addTo(group);
      } else {
        const title = feature.name && !/^(taxis)$/i.test(feature.name) ? feature.name : layer.label;
        L.marker([feature.point.lat, feature.point.lon], { icon: pin(MOBILITY_COLOR, '', layer.glyph), title, alt: title })
          .bindPopup(popup).addTo(group);
      }
    }
    layers[layer.key] = group;
  }
  for (const [key] of Object.entries(layers)) setLayer(key, state.layersOn.has(key));

  if (state.me) {
    if (meMarker) meMarker.remove();
    meMarker = L.marker([state.me.lat, state.me.lon], { icon: pin('#1a73e8', 'me'), title: 'Tu ubicación', alt: 'Tu ubicación', zIndexOffset: 1000 }).addTo(map);
  }
  if (pendingFocus) applyFocus();
}

const LAYER_GROUPS = [
  ['Ocio y turismo', ['playas', 'parques', 'monumentos', 'museos', 'restaurantes']],
  ['Alojamiento', ['hoteles', 'hostales', 'apartamentos', 'campings', 'albergues']],
  ['Servicios', ['cajeros', 'bibliotecas']],
  ['Medio ambiente', ['aire']],
  ['Movilidad', MOBILITY.map((layer) => layer.key), 'Del Plan de Movilidad Urbana (PMUS): algunos datos pueden no estar al día.'],
];

function layerItems() {
  const mobility = MOBILITY.map((layer) => ({ ...layer, color: layer.color ?? MOBILITY_COLOR }));
  return [{ key: 'aire', label: 'Estaciones de aire', color: 'var(--ink)' }, ...CATEGORIES, ...mobility]
    .filter((item) => item.key === 'aire' || layerCount(item.key) === undefined || layerCount(item.key) > 0);
}

function layerCount(key) {
  if (key === 'aire') return state.air?.length;
  if (key in state.mobility) return state.mobility[key].length;
  return state.places[key]?.length;
}

function toggleLayer(key, on) {
  if (on) state.layersOn.add(key);
  else state.layersOn.delete(key);
  setLayer(key, on);
}

function renderChips() {
  const items = layerItems();
  fill('chips', items.map((item) => {
    const count = layerCount(item.key);
    return h('button', {
      class: 'chip', style: `--c:${item.color}`, 'aria-pressed': String(state.layersOn.has(item.key)),
      onclick: () => {
        toggleLayer(item.key, !state.layersOn.has(item.key));
        renderChips();
      },
    }, h('i', { class: item.kind === 'line' ? 'line' : item.glyph ? 'glyph' : '' }, item.glyph ?? ''), item.label, count ? ` (${count})` : '');
  }));
  const active = items.filter((item) => state.layersOn.has(item.key)).length;
  const badge = byId('layers-count');
  if (badge) {
    badge.textContent = String(active);
    byId('layers-open').setAttribute('aria-label', `Capas del mapa, ${active} activas`);
  }
  renderLayerSheet(items);
}

function renderLayerSheet(items) {
  const sheet = byId('layers-sheet');
  if (!sheet) return;
  const scroll = sheet.scrollTop;
  const row = (item) => h('label', { class: 'layer-row' },
    h('i', { class: item.kind === 'line' ? 'line' : '', style: `--c:${item.color}` }, item.glyph ?? ''),
    h('span', {}, item.label),
    layerCount(item.key) ? h('small', {}, String(layerCount(item.key))) : null,
    h('input', {
      type: 'checkbox', role: 'switch', 'data-layer': item.key, checked: state.layersOn.has(item.key),
      onchange: (event) => {
        toggleLayer(item.key, event.target.checked);
        renderChips();
        sheet.querySelector(`[data-layer="${item.key}"]`)?.focus();
      },
    }),
  );
  fill('layers-sheet',
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Capas del mapa'), h('button', { type: 'button', onclick: () => sheet.close() }, 'Cerrar')),
    h('div', { class: 'sheet-body' }, LAYER_GROUPS.map(([title, keys, note]) => {
      const group = keys.map((key) => items.find((item) => item.key === key)).filter(Boolean);
      if (!group.length) return null;
      const allOn = group.every((item) => state.layersOn.has(item.key));
      return h('section', { class: 'sheet-group' },
        h('div', { class: 'sheet-group-head' },
          h('h3', {}, title),
          group.length > 1 && h('button', {
            type: 'button',
            onclick: () => { group.forEach((item) => toggleLayer(item.key, !allOn)); renderChips(); },
          }, allOn ? 'Ninguna' : 'Todas')),
        group.map(row),
        note && h('p', { class: 'note' }, note));
    }).filter(Boolean)),
  );
  sheet.scrollTop = scroll;
}

function applyFocus() {
  const place = pendingFocus;
  const marker = markers.get(place.id);
  if (!map || !marker) return;
  pendingFocus = null;
  state.layersOn.add(place.category);
  setLayer(place.category, true);
  renderChips();
  map.setView([place.lat, place.lon], 15);
  marker.openPopup();
}

function focusPlace(place) {
  pendingFocus = place;
  if (location.hash === '#mapa') applyFocus();
  else location.hash = '#mapa';
}

// Navegación
const PAGE_TITLES = {
  hoy: 'Gijón hoy: tiempo, mareas, agenda y playas de Gijón',
  tiempo: 'Tiempo y mareas en Gijón hoy · Gijón hoy',
  agenda: 'Agenda de Gijón: qué hacer hoy · Gijón hoy',
  mapa: 'Mapa de Gijón: playas, parques, bici y aparcamientos · Gijón hoy',
  agua: 'Calidad del agua en Gijón: grifo y playas · Gijón hoy',
};

function route() {
  const tab = ['hoy', 'mapa', 'agenda', 'agua', 'tiempo'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'hoy';
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== `view-${tab}`; });
  document.title = PAGE_TITLES[tab];
  document.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (tab === 'mapa') {
    initMap();
    requestAnimationFrame(() => {
      map?.invalidateSize();
      if (pendingFocus) applyFocus();
    });
  }
}

function updateOnline() {
  byId('offline').hidden = navigator.onLine;
}

function start() {
  byId('today').textContent = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  addEventListener('hashchange', route);
  addEventListener('online', updateOnline);
  addEventListener('offline', updateOnline);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (Date.now() - state.airLoadedAt > REFRESH_MS) loadAir();
    if (Date.now() - state.feedsLoadedAt > REFRESH_MS) {
      state.feedsLoadedAt = Date.now();
      loadNotices();
      loadEvents();
      loadWeather();
    }
  });
  state.prefs = loadPrefs();
  const prefsSheet = byId('prefs-sheet');
  byId('prefs-open')?.addEventListener('click', openPrefs);
  prefsSheet?.addEventListener('click', (event) => { if (event.target === prefsSheet) prefsSheet.close(); });
  renderPersonal();
  const eventSheet = byId('event-sheet');
  eventSheet?.addEventListener('click', (event) => { if (event.target === eventSheet) eventSheet.close(); });
  const sheet = byId('layers-sheet');
  byId('layers-open')?.addEventListener('click', () => sheet.showModal());
  sheet?.addEventListener('click', (event) => { if (event.target === sheet) sheet.close(); });
  updateOnline();
  renderAir();
  renderEvents();
  renderNotices();
  renderWeather();
  renderWeatherView();
  renderWater();
  renderBeaches();
  renderChips();
  route();
  state.feedsLoadedAt = Date.now();
  loadAir();
  loadNotices();
  loadEvents();
  loadWeather();
  loadWater();
  loadPlaces();
  loadMobility();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker', error));
  }
}

start();
