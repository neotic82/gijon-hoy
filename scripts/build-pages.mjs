// Genera páginas HTML indexables por buscadores (mareas, tiempo, agenda, playas, aire) con los datos del día.
// La app carga los datos en el navegador; estas páginas los llevan ya escritos en el HTML.
//
// Uso: node scripts/build-pages.mjs [carpeta de salida]   (por defecto, _site)
// Copia la app a la carpeta de salida y añade las páginas y el sitemap. Lo ejecuta GitHub Actions.
process.env.TZ = 'Europe/Madrid'; // data.js interpreta las fechas del portal en hora local.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AIR_ID, AQI_LEVELS, CATEGORIES, EVENT_IDS, POLLUTANT_LABELS, WATER_IDS, WEATHER_URLS, WEB_URLS,
  bathingForBeach, dataUrl, googleCalendarUrl, isLongRunning, moonPhase, normalizeEvents, normalizePlaces,
  occursBetween, parseTides, summarizeAir, summarizeBathing, summarizeMarine, summarizeWeather, tideUrl, weatherIcon,
} from '../js/data.js';
import { iconSvg } from '../js/icons.js';

const SITE_URL = (process.env.SITE_URL || 'https://neotic82.github.io/gijon-hoy/').replace(/\/?$/, '/');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '_site'));
const NOW = Date.now();
const DAY = 86400e3;
const EVENT_PAGE_DAYS = 31;
const MAX_EVENT_PAGES = 400;

// ---------- Utilidades ----------

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const num = (value, digits = 0) => value.toLocaleString('es-ES', { maximumFractionDigits: digits });
const meters = (value) => `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const clip = (text, max = 158) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);
const slugify = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shortHash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 8);

const fmt = (options) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...options });
const fHour = fmt({ hour: '2-digit', minute: '2-digit' });
const fLongDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fDayMonth = fmt({ day: 'numeric', month: 'long' });
const fDate = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
const fWeekday = fmt({ weekday: 'long' });
const hour = (ms) => fHour.format(ms);
const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayStart = (offset = 0) => { const d = new Date(NOW); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime(); };
const isMidnight = (ms) => { const d = new Date(ms); return d.getHours() === 0 && d.getMinutes() === 0; };
const isLastMinute = (ms) => { const d = new Date(ms); return d.getHours() === 23 && d.getMinutes() === 59; };

function relativeDay(ms) {
  if (dayKey(ms) === dayKey(NOW)) return 'Hoy';
  if (dayKey(ms) === dayKey(NOW + DAY)) return 'Mañana';
  return capital(fWeekday.format(ms));
}
// «Hoy, martes 10 de noviembre» · «Jueves 12 de noviembre»
function dayHeading(ms) {
  const rel = relativeDay(ms);
  return rel === 'Hoy' || rel === 'Mañana' ? `${rel}, ${fLongDay.format(ms)}` : capital(fLongDay.format(ms));
}

// Fecha ISO 8601 con la diferencia horaria de Madrid (la que aplica en esa fecha).
function isoLocal(ms) {
  const d = new Date(ms);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${dayKey(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

async function fetchData(url, type = 'json') {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'GijonHoy-pages/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return type === 'json' ? await response.json() : await response.text();
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
// Una fuente caída no detiene la generación: su página muestra un aviso y remite a la app.
const optional = (label, promise) => promise.catch((error) => {
  console.warn(`Aviso: ${label} no disponible (${error.message})`);
  return null;
});

// ---------- Carga de datos ----------

async function loadData() {
  const beachIds = CATEGORIES.find((c) => c.key === 'playas').ids;
  const [forecast, marine, air, bathing, beaches, webEvents, institutional, ...tides] = await Promise.all([
    optional('pronóstico', fetchData(WEATHER_URLS.forecast)),
    optional('mar', fetchData(WEATHER_URLS.marine)),
    optional('aire', fetchData(dataUrl(AIR_ID))),
    optional('agua de baño', fetchData(dataUrl(WATER_IDS.bathing))),
    optional('playas', fetchData(dataUrl(beachIds[0]))),
    optional('agenda web', fetchData(WEB_URLS.events)),
    optional('agenda institucional', fetchData(dataUrl(EVENT_IDS.institucional))),
    // Días UTC del IHM: de ayer a dentro de 8 días cubren los 7 días locales completos.
    ...[-1, 0, 1, 2, 3, 4, 5, 6, 7].map((offset) => optional('mareas', fetchData(tideUrl(NOW + offset * DAY)))),
  ]);
  const agendaRows = webEvents ?? await optional('agenda abierta', fetchData(dataUrl(EVENT_IDS.agenda)));
  return {
    weather: forecast && summarizeWeather(forecast, NOW),
    marine: marine && summarizeMarine(marine),
    air: air ? summarizeAir(air, NOW) : [],
    bathing: bathing && summarizeBathing(bathing),
    beaches: normalizePlaces(beaches ?? [], 'playas')
      // El conjunto incluye una ficha de zonas para mascotas y una duplicada sin «Playa».
      .filter((b) => /^playa\b/i.test(b.title))
      .sort((a, b) => a.lon - b.lon),
    events: agendaRows || institutional ? normalizeEvents(agendaRows ?? [], institutional ?? [], NOW) : null,
    tides: parseTides(tides.filter(Boolean)),
  };
}

// ---------- Plantilla ----------

const NAV = (() => {
  const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const nav = index.match(/<nav class="tabs"[\s\S]*?<\/nav>/)?.[0];
  if (!nav) throw new Error('No se encuentra la barra de navegación en index.html');
  return nav;
})();

const HUBS = [
  { path: 'tiempo/', label: 'El tiempo en Gijón', hint: 'Previsión de 7 días y estado del mar' },
  { path: 'mareas/', label: 'Mareas en Gijón', hint: 'Pleamar y bajamar en el puerto' },
  { path: 'agenda/', label: 'Agenda de Gijón', hint: 'Qué hacer hoy y esta semana' },
  { path: 'playas/', label: 'Playas de Gijón', hint: 'Calidad del agua, mareas y cómo llegar' },
  { path: 'calidad-del-aire/', label: 'Calidad del aire en Gijón', hint: 'Índice europeo por estaciones' },
];

const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function breadcrumbLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE_URL + c.path })),
  };
}

const UPDATED = `${capital(fLongDay.format(NOW))}, ${hour(NOW)}`;

function layout({ path, title, description, h1, lead, body, crumbs, ld = [], image, ogType = 'website' }) {
  const root = '../'.repeat(path.split('/').filter(Boolean).length);
  const url = SITE_URL + path;
  const ogImage = image || `${SITE_URL}icons/og.png`;
  const trail = [{ name: 'Gijón hoy', path: '' }, ...crumbs];
  const others = HUBS.filter((hub) => hub.path !== path);
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="Gijón hoy">
  <meta property="og:locale" content="es_ES">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  ${ldScript(breadcrumbLd(trail))}
  ${ld.map(ldScript).join('\n  ')}
  <meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#020617" media="(prefers-color-scheme: dark)">
  <link rel="preload" href="${root}vendor/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="manifest" href="${root}manifest.webmanifest">
  <link rel="icon" href="${root}icons/icon-192.png" type="image/png">
  <link rel="apple-touch-icon" href="${root}icons/icon-180.png">
  <link rel="stylesheet" href="${root}css/app.css">
  <link rel="stylesheet" href="${root}css/pages.css">
  <script data-goatcounter="https://gijonhoy.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</head>
<body class="page">
  <header class="top">
    <a class="brand" href="${root}">
      <img src="${root}icons/icon-192.png" alt="" width="32" height="32">
      <div><span class="brand-name">Gijón hoy</span><p>Actualizado: ${esc(UPDATED)}</p></div>
    </a>
    ${NAV.replace(/href="#/g, `href="${root}#`)}
  </header>
  <main class="view narrow">
    <nav class="crumbs" aria-label="Ruta">${trail.map((c, i) => (i < trail.length - 1
    ? `<a href="${root}${c.path}">${esc(c.name)}</a><span aria-hidden="true">›</span>`
    : `<span aria-current="page">${esc(c.name)}</span>`)).join('')}</nav>
    <h1>${esc(h1)}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
    ${body}
    <a class="cta" href="${root}">
      <strong>Abrir Gijón hoy</strong>
      <span>Datos al minuto, mapa, avisos de tus líneas de bus y agenda filtrable. Gratis y sin registro.</span>
    </a>
    <nav class="hubs" aria-label="Más de Gijón hoy">
      <h2>Más de Gijón hoy</h2>
      <ul>${others.map((hub) => `<li><a href="${root}${hub.path}"><strong>${esc(hub.label)}</strong><span>${esc(hub.hint)}</span></a></li>`).join('')}</ul>
    </nav>
    <footer class="credits">
      <p>Proyecto independiente, sin relación oficial con el Ayuntamiento. Página generada automáticamente: ${esc(UPDATED)}.
        Datos: <a href="https://www.gijon.es/es/datos" rel="noopener">Ayuntamiento de Gijón</a> (<a href="https://creativecommons.org/licenses/by/4.0/deed.es" rel="noopener">CC BY 4.0</a>) y web municipal de <a href="https://www.gijon.es" rel="noopener">gijon.es</a>.
        Tiempo y mar: <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).
        Mareas: <a href="https://ideihm.covam.es/" rel="noopener">Instituto Hidrográfico de la Marina</a>.
        Índice de aire: <a href="https://airindex.eea.europa.eu/AQI/index.html" rel="noopener">Agencia Europea de Medio Ambiente</a>, cálculo orientativo.</p>
    </footer>
  </main>
</body>
</html>
`;
}

const unavailable = (what) => `<p class="callout">Ahora mismo no hay datos de ${what}. Puedes consultarlos en la app, que los carga en directo.</p>`;
const wxIcon = (code, isDay = true) => {
  const key = weatherIcon(code, isDay);
  return key ? `<span class="wx-ic wx-${key}" aria-hidden="true">${iconSvg(key)}</span>` : '';
};
const definitionList = (pairs) => `<dl class="weather wx-grid">${pairs.filter((p) => p && p[1])
  .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
const block = (title, content, id = '') => `<section class="block"${id ? ` id="${id}"` : ''}><div class="block-head"><h2>${esc(title)}</h2></div>${content}</section>`;

// ---------- Mareas ----------

const tideName = (type) => (type === 'high' ? 'Pleamar' : 'Bajamar');

function tidesOfDay(tides, offset) {
  const from = dayStart(offset);
  const to = dayStart(offset + 1);
  return tides.filter((t) => t.time >= from && t.time < to);
}

function tideSentence(dayTides) {
  const list = (type) => dayTides.filter((t) => t.type === type).map((t) => `${hour(t.time)} (${meters(t.height)})`);
  const join = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items.at(-1)}` : items[0]);
  const highs = list('high');
  const lows = list('low');
  return [highs.length && `pleamar a las ${join(highs)}`, lows.length && `bajamar a las ${join(lows)}`].filter(Boolean).join('; ');
}

function tideTable(dayTides) {
  return `<table class="tbl"><thead><tr><th scope="col">Marea</th><th scope="col">Hora</th><th scope="col">Altura</th></tr></thead><tbody>${dayTides
    .map((t) => `<tr><td><span class="tide-dot ${t.type}" aria-hidden="true"></span>${tideName(t.type)}</td><td>${hour(t.time)}</td><td>${meters(t.height)}</td></tr>`).join('')}</tbody></table>`;
}

const moonText = (ms) => {
  const moon = moonPhase(ms);
  return `${moon.name}${moon.tides ? ` · mareas ${moon.tides}` : ''}`;
};

function tidesPage({ tides }) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => ({ offset, start: dayStart(offset), tides: tidesOfDay(tides, offset) }))
    .filter((d) => d.tides.length);
  const today = days.find((d) => d.offset === 0);
  const lead = today
    ? `${esc(dayHeading(today.start))}, en el puerto de Gijón hay ${esc(tideSentence(today.tides))}. ${esc(moonText(today.start + DAY / 2))}.`
    : 'Horas y alturas de la pleamar y la bajamar en el puerto de Gijón para los próximos días.';
  const body = days.length
    ? days.map((d) => `<section class="block"><div class="block-head"><h2>${esc(dayHeading(d.start))}</h2></div>${tideTable(d.tides)}<p class="note">${esc(moonText(d.start + DAY / 2))}</p></section>`).join('')
      + '<p class="note first">Horas oficiales de la península. Alturas en metros sobre el cero hidrográfico del puerto. Predicción del Instituto Hidrográfico de la Marina: no tiene en cuenta el efecto del viento ni de la presión.</p>'
    : unavailable('mareas');
  return layout({
    path: 'mareas/',
    title: 'Mareas en Gijón hoy: pleamar y bajamar | Gijón hoy',
    description: clip(today ? `Mareas en Gijón hoy: ${tideSentence(today.tides)}. Tabla de mareas del puerto para 7 días y fase lunar.` : 'Tabla de mareas del puerto de Gijón para los próximos 7 días: horas y alturas de pleamar y bajamar, y fase lunar.'),
    h1: 'Mareas en Gijón',
    lead,
    body,
    crumbs: [{ name: 'Mareas', path: 'mareas/' }],
  });
}

// ---------- Tiempo ----------

function dayWeatherText(d) {
  return [
    d.text,
    d.max !== null && d.min !== null && `máxima de ${num(d.max)} °C y mínima de ${num(d.min)} °C`,
    d.rain !== null && `${num(d.rain)} % de probabilidad de lluvia`,
    d.wind !== null && `viento${d.dir ? ` del ${d.dir}` : ''} de hasta ${num(d.wind)} km/h`,
  ].filter(Boolean).join(', ');
}

function weatherPage({ weather, marine }) {
  if (!weather) {
    return layout({
      path: 'tiempo/', title: 'El tiempo en Gijón: previsión de 7 días | Gijón hoy',
      description: 'Previsión del tiempo en Gijón para 7 días: temperaturas, lluvia, viento, índice UV, estado del mar y temperatura del agua.',
      h1: 'El tiempo en Gijón', body: unavailable('previsión'), crumbs: [{ name: 'Tiempo', path: 'tiempo/' }],
    });
  }
  const today = weather.days[0];
  const seaByDay = new Map((marine?.days ?? []).map((d) => [dayKey(d.date), d]));
  const lead = `${esc(dayHeading(today.date))}: ${esc(dayWeatherText(today))}.${today.sunrise ? ` Sale el sol a las ${esc(today.sunrise)} y se pone a las ${esc(today.sunset)}.` : ''}`;
  const days = weather.days.map((d) => {
    const sea = seaByDay.get(dayKey(d.date));
    return `<li class="fc-day">
      ${wxIcon(d.code)}
      <div>
        <h3>${esc(dayHeading(d.date))}</h3>
        <p>${esc(capital(dayWeatherText(d)))}.</p>
        ${definitionList([
    ['Lluvia', d.rainSum !== null && d.rainSum > 0 ? `${num(d.rainSum, 1)} mm` : ''],
    ['Rachas', d.gusts !== null ? `${num(d.gusts)} km/h` : ''],
    ['Índice UV', d.uv !== null ? num(d.uv) : ''],
    ['Olas', sea?.wave != null ? `${num(sea.wave, 1)} m${sea.dir ? ` ${sea.dir}` : ''}` : ''],
    ['Sol', d.sunrise ? `${d.sunrise}–${d.sunset}` : ''],
  ])}
      </div>
    </li>`;
  }).join('');
  const sea = marine ? block('Estado del mar', `${definitionList([
    ['Agua', marine.sst !== null ? `${num(marine.sst, 1)} °C` : ''],
    ['Olas', marine.wave !== null ? `${num(marine.wave, 1)} m` : ''],
    ['Periodo', marine.period !== null ? `${num(marine.period)} s` : ''],
    ['Dirección', marine.dir],
    ['Mar de fondo', marine.swell !== null ? `${num(marine.swell, 1)} m` : ''],
  ])}<p class="note">Medido mar adentro, frente a Gijón, a las ${esc(hour(NOW))}. En la costa las olas suelen ser algo menores. <a href="../mareas/">Ver las mareas</a>.</p>`) : '';
  return layout({
    path: 'tiempo/',
    title: 'El tiempo en Gijón: previsión de 7 días y estado del mar | Gijón hoy',
    description: clip(`El tiempo en Gijón hoy: ${dayWeatherText(today)}. Previsión de 7 días, olas y temperatura del agua.`),
    h1: 'El tiempo en Gijón',
    lead,
    body: `${block('Previsión para 7 días', `<ul class="fc">${days}</ul>`)}${sea}<p class="note first">Previsión de Open-Meteo con modelos de ECMWF, DWD, NOAA y Météo-France. Se actualiza varias veces al día.</p>`,
    crumbs: [{ name: 'Tiempo', path: 'tiempo/' }],
  });
}

// ---------- Calidad del aire ----------

function airPage({ air }) {
  const counts = AQI_LEVELS.map((label, level) => ({ label, n: air.filter((s) => s.level === level).length })).filter((c) => c.n);
  const lead = air.length
    ? `Hoy, ${esc(fLongDay.format(NOW))}, ${counts.map((c) => `${c.n === 1 ? 'una estación mide' : `${c.n} estaciones miden`} una calidad del aire ${esc(c.label.toLowerCase())}`).join(', ')}, según el índice europeo de la AEMA.`
    : '';
  const cell = (s, key) => (s.pollutants[key] ? num(s.pollutants[key].value) : '—');
  const rows = air.map((s) => `<tr><th scope="row">${esc(s.name)}</th><td><span class="lvl" style="--level: var(--l${s.level})"></span>${esc(AQI_LEVELS[s.level])}</td>${
    ['pm25', 'pm10', 'no2', 'o3'].map((k) => `<td>${cell(s, k)}</td>`).join('')}<td>${esc(hour(s.updated))}</td></tr>`).join('');
  const body = air.length
    ? `${block('Por estaciones', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">Estación</th><th scope="col">Índice</th>${
      ['pm25', 'pm10', 'no2', 'o3'].map((k) => `<th scope="col">${POLLUTANT_LABELS[k]}</th>`).join('')}<th scope="col">Hora</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Concentraciones en µg/m³. Partículas (PM2,5 y PM10): media de las últimas 24 horas; resto: último valor horario. Datos provisionales de las estaciones municipales.</p>`)}`
    : unavailable('calidad del aire');
  return layout({
    path: 'calidad-del-aire/',
    title: 'Calidad del aire en Gijón hoy por estaciones | Gijón hoy',
    description: clip(air.length ? `Calidad del aire en Gijón hoy: ${counts.map((c) => `${c.n} ${c.n === 1 ? 'estación' : 'estaciones'} ${c.label.toLowerCase()}`).join(', ')}. PM2,5, PM10, NO₂ y ozono por estación.` : 'Calidad del aire en Gijón por estaciones: índice europeo, partículas PM2,5 y PM10, dióxido de nitrógeno y ozono.'),
    h1: 'Calidad del aire en Gijón',
    lead,
    body,
    crumbs: [{ name: 'Calidad del aire', path: 'calidad-del-aire/' }],
  });
}

// ---------- Agenda ----------

const isAllDaySession = (s) => isMidnight(s.start) && isLastMinute(s.end);

function sessionText(s) {
  if (dayKey(s.start) === dayKey(s.end)) {
    const day = capital(fLongDay.format(s.start));
    if (isAllDaySession(s)) return day;
    return s.openEnd ? `${day}, a las ${hour(s.start)}` : `${day}, de ${hour(s.start)} a ${hour(s.end)}`;
  }
  const time = isMidnight(s.start) ? '' : `, desde las ${hour(s.start)}`;
  return `Del ${fDayMonth.format(s.start)} al ${fDate.format(s.end)}${time}`;
}

// Hora que se muestra en la lista de un día concreto.
function timeOnDay(event, from, to) {
  const s = event.sessions.find((x) => x.start <= to && x.end >= from);
  if (!s || s.start < from || isAllDaySession(s) || (isMidnight(s.start) && dayKey(s.start) !== dayKey(s.end))) return 'Todo el día';
  return s.openEnd || dayKey(s.start) !== dayKey(s.end) ? hour(s.start) : `${hour(s.start)}–${hour(s.end)}`;
}

function eventPath(event) {
  const key = event.id || shortHash(`${event.title}|${event.start}`);
  return `agenda/${slugify(event.title).slice(0, 70).replace(/-$/, '')}-${key}/`;
}

const eventMeta = (event) => [event.type, event.place].filter(Boolean).join(' · ');

function eventItem(event, time, root) {
  return `<li><a href="${root}${event.path}"><span class="ev-time">${esc(time)}</span><span class="ev-body"><strong>${esc(event.title)}</strong>${eventMeta(event) ? `<span>${esc(eventMeta(event))}</span>` : ''}</span></a></li>`;
}

function agendaPage(events) {
  if (!events) {
    return layout({
      path: 'agenda/', title: 'Agenda de Gijón: qué hacer hoy y esta semana | Gijón hoy',
      description: 'Agenda de actos en Gijón: conciertos, teatro, exposiciones, deporte y actividades para hoy y los próximos días.',
      h1: 'Agenda de Gijón', body: unavailable('la agenda'), crumbs: [{ name: 'Agenda', path: 'agenda/' }],
    });
  }
  const short = events.filter((e) => !isLongRunning(e) && e.path);
  const long = events.filter((e) => isLongRunning(e) && e.path);
  const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const from = dayStart(offset);
    const to = dayStart(offset + 1) - 1;
    const list = short.filter((e) => occursBetween(e, offset === 0 ? Math.max(from, NOW) : from, to))
      .map((e) => ({ e, time: timeOnDay(e, from, to) }))
      .sort((a, b) => (a.time === 'Todo el día') - (b.time === 'Todo el día') || a.time.localeCompare(b.time));
    return { from, list };
  });
  const todayCount = days[0].list.length;
  const lead = `${esc(dayHeading(NOW))}${todayCount ? `, quedan ${todayCount} ${todayCount === 1 ? 'acto' : 'actos'} en la agenda de Gijón` : ', no quedan más actos en la agenda de Gijón'}, y hay ${days.slice(1).reduce((n, d) => n + d.list.length, 0)} más en los próximos seis días. También puedes ver las exposiciones y actividades de larga duración.`;
  const body = days.map((d) => block(dayHeading(d.from), d.list.length
    ? `<ul class="ev-list">${d.list.map(({ e, time }) => eventItem(e, time, '../')).join('')}</ul>`
    : '<p class="note first">No hay actos programados.</p>')).join('')
    + (long.length ? block('Exposiciones y actividades de larga duración', `<ul class="ev-list">${long.filter((e) => e.start <= NOW + 7 * DAY)
      .map((e) => eventItem(e, `Hasta el ${fDayMonth.format(e.end)}`, '../')).join('')}</ul>`) : '')
    + '<p class="note first">Agenda de la web municipal de gijon.es. Comprueba los detalles en la página oficial de cada acto.</p>';
  return layout({
    path: 'agenda/',
    title: 'Agenda de Gijón: qué hacer hoy y esta semana | Gijón hoy',
    description: clip(`Qué hacer en Gijón: ${todayCount ? `${todayCount} actos hoy` : 'actos'} y la agenda de los próximos 7 días. Conciertos, teatro, exposiciones, deporte y actividades infantiles.`),
    h1: 'Agenda de Gijón: qué hacer hoy y esta semana',
    lead,
    body,
    crumbs: [{ name: 'Agenda', path: 'agenda/' }],
  });
}

function eventLd(event) {
  if (!event.place) return null; // Google exige un lugar.
  const allDay = isAllDaySession(event);
  const date = (ms) => (allDay ? dayKey(ms) : isoLocal(ms));
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: date(event.start),
    ...(event.openEnd ? {} : { endDate: date(event.end) }),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.place,
      address: { '@type': 'PostalAddress', ...(event.address ? { streetAddress: event.address } : {}), addressLocality: 'Gijón', addressRegion: 'Asturias', addressCountry: 'ES' },
    },
    ...(event.image ? { image: [event.image] } : {}),
    description: clip(`${event.type || 'Acto'} en Gijón. ${sessionText(event)}${event.place ? `, en ${event.place}` : ''}.`, 300),
    url: SITE_URL + event.path,
  };
}

function eventPage(event, events, weather) {
  const shown = new Date(Math.max(event.start, NOW));
  const from = new Date(shown.getFullYear(), shown.getMonth(), shown.getDate()).getTime();
  const to = from + DAY - 1;
  const sameDay = events.filter((e) => e !== event && e.path && !isLongRunning(e) && occursBetween(e, Math.max(from, NOW), to)).slice(0, 6);
  const forecast = weather?.days.find((d) => dayKey(d.date) === dayKey(Math.max(event.start, NOW)));
  const upcoming = event.sessions.slice(0, 12);
  const facts = [
    ['Cuándo', upcoming.length > 1 ? `<ul class="plain">${upcoming.map((s) => `<li>${esc(sessionText(s))}</li>`).join('')}</ul>` : esc(sessionText(event))],
    event.place && ['Dónde', esc([event.place, event.address].filter(Boolean).join(', '))],
    event.type && ['Tipo', esc(event.type)],
    event.topic && ['Tema', esc(event.topic)],
    event.district && ['Distrito', esc(event.district)],
  ].filter(Boolean);
  const body = `
    ${event.image ? `<figure class="photo-wide"><img src="${esc(event.image)}" alt="" decoding="async" width="890" height="668" referrerpolicy="no-referrer"></figure>` : ''}
    <section class="block"><dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="actions">
        ${event.url ? `<a class="btn primary" href="${esc(event.url)}" rel="noopener">Más información en gijon.es</a>` : ''}
        <a class="btn" href="${esc(googleCalendarUrl(event))}" rel="noopener nofollow">Añadir a Google Calendar</a>
      </div>
    </section>
    ${forecast ? block(`El tiempo ${relativeDay(forecast.date) === 'Hoy' ? 'hoy' : `el ${fWeekday.format(forecast.date)}`}`, `<p class="fc-inline">${wxIcon(forecast.code)}<span>${esc(capital(dayWeatherText(forecast)))}. <a href="../../tiempo/">Ver la previsión</a></span></p>`) : ''}
    ${sameDay.length ? block('Ese mismo día en Gijón', `<ul class="ev-list">${sameDay.map((e) => eventItem(e, timeOnDay(e, from, to), '../../')).join('')}</ul><p class="note"><a href="../">Ver toda la agenda</a></p>`) : ''}
    <p class="note first">Información de la agenda municipal de gijon.es. Horarios y precios pueden cambiar: consulta la página oficial.</p>`;
  const when = sessionText(event);
  return layout({
    path: event.path,
    title: `${clip(event.title, 70)} en Gijón | Gijón hoy`,
    description: clip(`${event.title}: ${when}${event.place ? `, en ${event.place}` : ''}, Gijón.${event.type ? ` ${event.type}.` : ''}`),
    h1: event.title,
    lead: esc(`${when}${event.place ? ` · ${event.place}` : ''}`),
    body,
    crumbs: [{ name: 'Agenda', path: 'agenda/' }, { name: clip(event.title, 50), path: event.path }],
    ld: [eventLd(event)].filter(Boolean),
    image: event.image,
    ogType: 'article',
  });
}

// ---------- Playas ----------

const beachSlug = (title) => slugify(title.replace(/^playa\s+(de\s+los|de\s+las|de\s+la|del|de)\s+/i, '').replace(/^l'/i, ''));
const bathLabel = (status) => (status === 'ok' ? 'Apta para el baño' : 'Baño no recomendable');

function bathingBlock(bathing, beach) {
  const zones = bathing?.zones.filter((z) => z.beach.test(beach.title) && z.status) ?? [];
  if (!zones.length) return '';
  return block('Calidad del agua de baño', `<ul class="zones">${zones.map((z) => `<li><span class="badge ${z.status}">${esc(bathLabel(z.status))}</span> ${esc(z.label)} <span class="muted">· ${esc(fDate.format(z.date))}</span></li>`).join('')}</ul>
    <p class="note">Último análisis sanitario de cada punto de muestreo. Los análisis se hacen en temporada de baño.</p>`);
}

function beachPage(beach, data) {
  const { bathing, tides, weather, marine } = data;
  const today = tidesOfDay(tides, 0);
  const forecast = weather?.days[0];
  const sea = marine?.days[0];
  const status = bathingForBeach(bathing, beach.title);
  const osm = `https://www.openstreetmap.org/?mlat=${beach.lat}&mlon=${beach.lon}#map=17/${beach.lat}/${beach.lon}`;
  const lines = beach.lineNames.length
    ? `<ul class="plain">${beach.lineNames.map(([line, name]) => `<li><strong>${esc(line)}</strong> ${esc(name)}</li>`).join('')}</ul>` : '';
  const body = `
    ${beach.image ? `<figure class="photo-wide"><img src="${esc(beach.image)}" alt="${esc(beach.title)}" decoding="async" width="890" height="668" referrerpolicy="no-referrer"></figure>` : ''}
    ${beach.description ? block('Cómo es', `<p>${esc(beach.description)}</p>`) : ''}
    ${bathingBlock(bathing, beach)}
    ${today.length ? block('Mareas hoy', `${tideTable(today)}<p class="note">Puerto de Gijón. <a href="../../mareas/">Mareas de los próximos días</a></p>`) : ''}
    ${forecast ? block('Tiempo y mar hoy', `<p class="fc-inline">${wxIcon(forecast.code)}<span>${esc(capital(dayWeatherText(forecast)))}.</span></p>${definitionList([
    ['Agua', marine?.sst != null ? `${num(marine.sst, 1)} °C` : ''],
    ['Olas', sea?.wave != null ? `${num(sea.wave, 1)} m` : ''],
    ['Índice UV', forecast.uv !== null ? num(forecast.uv) : ''],
    ['Sol', forecast.sunrise ? `${forecast.sunrise}–${forecast.sunset}` : ''],
  ])}<p class="note"><a href="../../tiempo/">Previsión de 7 días</a></p>`) : ''}
    ${block('Cómo llegar', `${beach.address ? `<p>${esc(beach.address)}</p>` : ''}${lines ? `<h3 class="sub-h">Autobuses de EMTUSA</h3>${lines}` : ''}<p class="note"><a href="${esc(osm)}" rel="noopener">Ver en OpenStreetMap</a></p>`)}`;
  const statusText = status ? ` ${bathLabel(status.status)} en el último análisis.` : '';
  return layout({
    path: beach.path,
    title: `${beach.title} (Gijón): agua, mareas y cómo llegar | Gijón hoy`,
    description: clip(`${beach.title}, en Gijón: calidad del agua, mareas de hoy, tiempo, olas y líneas de autobús para llegar.${statusText}`),
    h1: beach.title,
    lead: esc(clip(`${beach.district ? `Distrito ${beach.district}. ` : ''}${status ? `${bathLabel(status.status)} según el último análisis (${fDate.format(status.date)}).` : 'Playa del concejo de Gijón.'}${today.length ? ` Hoy, ${tideSentence(today)}.` : ''}`, 400)),
    body,
    crumbs: [{ name: 'Playas', path: 'playas/' }, { name: beach.title, path: beach.path }],
    ld: [{
      '@context': 'https://schema.org',
      '@type': 'Beach',
      name: beach.title,
      ...(beach.description ? { description: clip(beach.description, 300) } : {}),
      ...(beach.image ? { image: beach.image } : {}),
      address: { '@type': 'PostalAddress', ...(beach.address ? { streetAddress: beach.address } : {}), addressLocality: 'Gijón', addressRegion: 'Asturias', addressCountry: 'ES' },
      geo: { '@type': 'GeoCoordinates', latitude: beach.lat, longitude: beach.lon },
      url: SITE_URL + beach.path,
    }],
    image: beach.image,
  });
}

function beachesPage({ beaches, bathing }) {
  const cards = beaches.map((b) => {
    const status = bathingForBeach(bathing, b.title);
    return `<li><a class="beach-card" href="../${b.path}">
      ${b.image ? `<img src="${esc(b.image)}" alt="" loading="lazy" decoding="async" width="240" height="160" referrerpolicy="no-referrer">` : '<span class="ph"></span>'}
      <span><strong>${esc(b.title)}</strong>${b.district ? `<span class="muted">${esc(b.district)}</span>` : ''}${status ? `<span class="badge ${status.status}">${esc(bathLabel(status.status))}</span>` : ''}</span>
    </a></li>`;
  }).join('');
  return layout({
    path: 'playas/',
    title: 'Playas de Gijón: calidad del agua, mareas y cómo llegar | Gijón hoy',
    description: clip(`Las ${beaches.length || ''} playas de Gijón: San Lorenzo, Poniente, El Arbeyal, Peñarrubia y más. Calidad del agua de baño, mareas, olas y autobuses para llegar.`.replace('Las  ', 'Las ')),
    h1: 'Playas de Gijón',
    lead: beaches.length ? `Gijón tiene ${beaches.length} playas, desde las urbanas de San Lorenzo, Poniente y El Arbeyal hasta las calas de la costa este. Elige una para ver la calidad del agua, las mareas de hoy y cómo llegar en autobús.` : '',
    body: beaches.length ? `<ul class="beach-grid">${cards}</ul>` : unavailable('playas'),
    crumbs: [{ name: 'Playas', path: 'playas/' }],
  });
}

// ---------- Salida ----------

function prepareOutput() {
  if (OUT === ROOT || ROOT.startsWith(OUT + sep)) throw new Error(`La carpeta de salida no puede ser el proyecto ni contenerlo: ${OUT}`);
  if (existsSync(OUT) && readdirSync(OUT).length && !existsSync(join(OUT, 'sw.js'))) {
    throw new Error(`${OUT} no está vacía y no parece una salida anterior: no se borra.`);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const skip = new Set(['scripts', 'test', 'node_modules', 'package.json', 'package-lock.json', basename(OUT)]);
  for (const entry of readdirSync(ROOT)) {
    if (entry.startsWith('.') || skip.has(entry)) continue;
    cpSync(join(ROOT, entry), join(OUT, entry), { recursive: true });
  }
}

function writePage(path, html) {
  mkdirSync(join(OUT, path), { recursive: true });
  writeFileSync(join(OUT, path, 'index.html'), html);
}

function sitemap(paths) {
  const today = dayKey(NOW);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${esc(SITE_URL + p)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
}

async function main() {
  const data = await loadData();
  prepareOutput();

  for (const beach of data.beaches) beach.path = `playas/${beachSlug(beach.title)}/`;
  const pageEvents = (data.events ?? []).filter((e) => e.start <= NOW + EVENT_PAGE_DAYS * DAY).slice(0, MAX_EVENT_PAGES);
  const usedPaths = new Set();
  for (const event of pageEvents) {
    let path = eventPath(event);
    if (usedPaths.has(path)) path = `${path.slice(0, -1)}-${shortHash(String(event.start))}/`;
    usedPaths.add(path);
    event.path = path;
  }

  const pages = [
    ['tiempo/', weatherPage(data)],
    ['mareas/', tidesPage(data)],
    ['agenda/', agendaPage(data.events)],
    ['playas/', beachesPage(data)],
    ['calidad-del-aire/', airPage(data)],
    ...data.beaches.map((b) => [b.path, beachPage(b, data)]),
    ...pageEvents.map((e) => [e.path, eventPage(e, data.events, data.weather)]),
  ];
  for (const [path, html] of pages) writePage(path, html);
  writeFileSync(join(OUT, 'sitemap.xml'), sitemap(['', ...pages.map(([path]) => path)]));

  console.log(`Generadas ${pages.length} páginas en ${OUT}: ${data.beaches.length} playas, ${pageEvents.length} actos, ${data.tides.length} mareas.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
