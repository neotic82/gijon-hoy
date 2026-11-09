import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aqiLevel, bathingForBeach, compareLines, parseKml, decodeEntities, districtCentroids, inDistrict, linesAffected, nearestDistrict, parseLineNames, isLongRunning, normalizeEvents, normalizeNotices, normalizePlaces, occursBetween, parseCoords, parseSessions, plainText, safeUrl, summarizeAir, summarizeBathing, summarizeTapWater, toNumber,
} from '../js/data.js';

test('toNumber admite los tipos mezclados del portal', () => {
  assert.equal(toNumber(1.03), 1.03);
  assert.equal(toNumber('0.76'), 0.76);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('n/d'), null);
  assert.equal(toNumber(0), 0);
});

test('parseCoords acepta ambos órdenes y descarta lo que está fuera de Gijón', () => {
  assert.deepEqual(parseCoords('Lon: -5.648688, Lat: 43.533062'), { lat: 43.533062, lon: -5.648688 });
  assert.deepEqual(parseCoords('Lat: 43.539211265163, Lon -5.6497571728277'), { lat: 43.539211265163, lon: -5.6497571728277 });
  assert.equal(parseCoords(''), null);
  assert.equal(parseCoords('Lon: 0, Lat: 0'), null);
});

test('texto: entidades, HTML y URLs', () => {
  assert.equal(decodeEntities('L&#039;Arena &quot;x&quot;'), `L'Arena "x"`);
  assert.equal(plainText('<p style="a">Hola<br />mundo</p>\n'), 'Hola mundo');
  assert.equal(safeUrl(' https://a.es/x.jpg '), 'https://a.es/x.jpg');
  assert.equal(safeUrl('javascript:alert(1)'), '');
});

test('aqiLevel respeta los límites de banda', () => {
  assert.equal(aqiLevel('pm25', 5), 0);
  assert.equal(aqiLevel('pm25', 6), 1);
  assert.equal(aqiLevel('no2', 33), 2);
  assert.equal(aqiLevel('o3', 181), 5);
  assert.equal(aqiLevel('o3', null), null);
});

test('normalizePlaces limpia campos y extrae líneas de bus sin repetir', () => {
  const [place, ...rest] = normalizePlaces([
    { titulo: 'Playa &amp; mar', localizacion: 'Lon: -5.608, Lat: 43.549', descripcion: '<p>Arena</p>', lineas_bus: 'Línea 14 A - B, Línea 25 C, Línea 14 A - B', imagen: ' https://a.es/i.jpg ' },
    { titulo: 'Sin coordenadas', localizacion: '' },
  ], 'playas');
  assert.equal(rest.length, 0);
  assert.equal(place.title, 'Playa & mar');
  assert.equal(place.description, 'Arena');
  assert.deepEqual(place.buses, ['14', '25']);
  assert.equal(place.image, 'https://a.es/i.jpg');
});

const air = (rows) => ({ calidadairemediatemporales: { calidadairemediatemporal: rows } });
const base = { estacion: 1, 'título': 'Estación de Prueba', latitud: 43.5, longitud: -5.6 };

test('summarizeAir ignora filas de 2021 y horas futuras vacías', () => {
  const now = Date.UTC(2026, 10, 9, 20, 30);
  const hours = Array.from({ length: 19 }, (_, i) => ({ ...base, fecha: '2026-11-09', periodo: i + 1, no2: 33, pm10: '18', pm25: 17, o3: 4, so2: 3, tmp: 15.8 }));
  const [station, ...rest] = summarizeAir(air([
    { ...base, fecha: '2021-10-08', periodo: 1, no2: 500 },
    ...hours,
    { ...base, fecha: '2026-11-09', periodo: 24, no2: '', pm10: '', pm25: '', o3: '', so2: '' },
  ]), now);
  assert.equal(rest.length, 0);
  assert.equal(station.name, 'Prueba');
  assert.equal(station.updated, Date.UTC(2026, 10, 9, 19));
  assert.equal(station.pollutants.pm25.value, 17);
  assert.equal(station.level, 2);
  assert.equal(station.weather.temp, 15.8);
  assert.equal(station.history.length, 19);
});

test('summarizeAir descarta estaciones sin datos recientes y no se rompe con datos inesperados', () => {
  const now = Date.UTC(2026, 10, 9, 20);
  assert.deepEqual(summarizeAir(air([{ ...base, fecha: '2026-11-07', periodo: 5, no2: 10 }]), now), []);
  assert.deepEqual(summarizeAir({}, now), []);
});

test('summarizeAir no calcula media de partículas con pocas horas', () => {
  const now = Date.UTC(2026, 10, 9, 5);
  const [station] = summarizeAir(air([1, 2, 3].map((periodo) => ({ ...base, fecha: '2026-11-09', periodo, pm25: 40, no2: 5 }))), now);
  assert.equal(station.pollutants.pm25, undefined);
  assert.equal(station.dominant, 'no2');
});

test('parseSessions entiende los formatos reales', () => {
  const pair = parseSessions('Mié, 18/11/2026 - 15:00\n - Mié, 18/11/2026 - 21:00\n, Jue, 19/11/2026 - 15:00\n - Jue, 19/11/2026 - 21:00\n');
  assert.equal(pair.length, 2);
  assert.equal(pair[1].start, new Date(2026, 10, 19, 15).getTime());
  const range = parseSessions('2024-08-30\n | 2025-06-20');
  assert.equal(range.length, 1);
  assert.equal(range[0].end, new Date(2025, 5, 20, 23, 59).getTime());
  const hours = parseSessions('2025-09-16\n - 2025-09-16', '16:00', '18:00');
  assert.equal(hours[0].start, new Date(2025, 8, 16, 16).getTime());
  assert.equal(parseSessions('2025-10-11', '23:59', '')[0].start <= parseSessions('2025-10-11', '23:59', '')[0].end, true);
  assert.deepEqual(parseSessions(''), []);
});

test('normalizeEvents filtra lo pasado, elimina duplicados y coloca primero lo que está en curso', () => {
  const now = new Date(2026, 10, 9, 21).getTime();
  const events = normalizeEvents(
    [{ titulo: 'Antiguo', fechas: '2025-02-17\n - 2025-03-05' }],
    [
      { titulo: 'Futuro &quot;A&quot;', fechas: 'Vie, 20/11/2026 - 18:00\n - Vie, 20/11/2026 - 19:30\n' },
      { titulo: 'Futuro &quot;A&quot;', fechas: 'Vie, 20/11/2026 - 18:00\n - Vie, 20/11/2026 - 19:30\n' },
      { titulo: 'Iluminaciones', fechas: 'Dom, 01/11/2026 - 00:00\n - Lun, 30/11/2026 - 23:59\n' },
      { titulo: 'Sesiones', fechas: 'Mar, 03/11/2026 - 08:00\n - Mar, 03/11/2026 - 09:00\n, Jue, 12/11/2026 - 10:00\n - Jue, 12/11/2026 - 11:00\n' },
    ],
    now,
  );
  assert.deepEqual(events.map((e) => e.title), ['Iluminaciones', 'Sesiones', 'Futuro "A"']);
  assert.equal(events[0].ongoing, true);
  assert.equal(events[0].allDay, true);
  assert.equal(events[1].start, new Date(2026, 10, 12, 10).getTime());
});

test('parseSessions: rarezas de horas de la web', () => {
  const noEnd = parseSessions('2026-11-20', '19:00', '')[0];
  assert.equal(noEnd.openEnd, true);
  assert.equal(noEnd.start, new Date(2026, 10, 20, 19).getTime());
  const midnightEnd = parseSessions('2026-11-20', '19:00', '00:00')[0];
  assert.equal(midnightEnd.openEnd, true);
  assert.equal(parseSessions('2026-11-20', '23:59', '')[0].start, new Date(2026, 10, 20, 0).getTime());
  assert.equal(parseSessions('2026-11-20', '10:00', '12:00')[0].openEnd, false);
});

test('normalizeEvents agrupa las filas por lugar y completa las rutas relativas', () => {
  const now = new Date(2026, 10, 9, 12).getTime();
  const base = { id: '7', titulo: 'Taller', fechas: '2026-11-20', hora_inicio: '18:00', hora_fin: '', materia: 'Social', alias: '/taller', imagen: '/sites/a.jpg?h=1&amp;itok=2 ' };
  const events = normalizeEvents([{ ...base, titulo_directorio: 'CMI El Coto' }, { ...base, titulo_directorio: 'CMI La Calzada' }], [], now);
  assert.equal(events.length, 1);
  assert.equal(events[0].place, 'CMI El Coto y 1 más');
  assert.equal(events[0].url, 'https://www.gijon.es/es/eventos/taller');
  assert.equal(events[0].image, 'https://www.gijon.es/sites/a.jpg?h=1&itok=2');
  assert.equal(events[0].topic, 'Social');
  assert.equal(events[0].sessions.length, 1);
});

test('normalizeEvents: un acto ya empezado sin hora de fin no se marca en curso', () => {
  const now = new Date(2026, 10, 20, 21).getTime();
  const [event] = normalizeEvents([{ titulo: 'Concierto', fechas: '2026-11-20', hora_inicio: '19:00', hora_fin: '' }], [], now);
  assert.equal(event.ongoing, false);
  assert.equal(event.openEnd, true);
});

test('isLongRunning y occursBetween', () => {
  const now = new Date(2026, 10, 9, 12).getTime();
  const [event] = normalizeEvents([{ titulo: 'Expo', fechas: '2026-10-08\n | 2027-01-10' }], [], now);
  assert.equal(isLongRunning(event), true);
  assert.equal(occursBetween(event, now, now + 3600e3), true);
  assert.equal(occursBetween(event, new Date(2027, 1, 1).getTime(), new Date(2027, 1, 2).getTime()), false);
});

test('normalizeNotices entiende la web y el conjunto abierto, y descarta los terminados', () => {
  const now = Date.parse('2026-11-09T21:00:00+01:00');
  const web = normalizeNotices([
    { id: '1', titulo: 'Obras', tipo: 'Cortes de Tráfico', descripcion: ' Texto ', fecha_inicio_html: '2026-02-20T07:00:00+0100', fecha_fin_html: '2026-12-31T23:00:00+0100', field_lineas_de_autobus: 'L10, L14, B4', alias: '/obras' },
    { id: '2', titulo: 'Huelga', tipo: 'Novedades Bus', fecha_inicio_html: '2026-11-09T07:00:00+0100', fecha_fin_html: '2026-11-11T23:59:00+0100', alias: '/huelga' },
    { id: '3', titulo: 'Viejo', fecha_inicio_html: '2025-01-01T07:00:00+0100', fecha_fin_html: '2025-02-01T07:00:00+0100' },
  ], now);
  assert.deepEqual(web.map((n) => n.title), ['Huelga', 'Obras']);
  assert.deepEqual(web[1].lines, ['L10', 'L14', 'B4']);
  assert.equal(web[1].url, 'https://www.gijon.es/es/avisos/obras');
  const open = normalizeNotices([{ titulo: 'A', tipo_incidencia: 'Corte', fecha_inicio_corte: '2026-11-01T07:00:00Z+01:00', fecha_fin_corte: '2026-12-01T07:00:00Z+01:00', lineas_autobus_afectadas: 'Línea 1 El Cerillero - Hospital, Línea 10 Pumarín', url: '/a' }], now);
  assert.equal(open[0].start, Date.parse('2026-11-01T07:00:00+01:00'));
  assert.deepEqual(open[0].lines, ['L1', 'L10']);
  assert.deepEqual(normalizeNotices({}, now), []);
});

test('summarizeTapWater toma el último análisis y conserva valores «<»', () => {
  const summary = summarizeTapWater({ verificaciones: { verificacion: [
    { id: 108, 'año': 2026, mes: 'Noviembre', puntodemuestreo: 'Roces', clorolibre: '0,56', nitritos: '<0,025', 'bacteríascoliformes': 0, escherichiacoli: 0, 'gérmenestotalesa22ºc': 2 },
    { id: 107, 'año': 2026, mes: 'Octubre', puntodemuestreo: 'Roces', clorolibre: '0,38', nitritos: '<0,025' },
    { id: 2, 'año': 2018, mes: 'Enero', puntodemuestreo: 'Roces', clorolibre: '0,24' },
  ] } });
  assert.equal(summary.month, 'noviembre');
  assert.equal(summary.params.find((p) => p.key === 'clorolibre').raw, '0,56');
  assert.equal(summary.params.find((p) => p.key === 'nitritos').raw, '<0,025');
  assert.deepEqual(summary.params.find((p) => p.key === 'clorolibre').series.map((p) => p.value), [0.24, 0.38, 0.56]);
  assert.equal(summary.params.find((p) => p.key === 'nitritos').series.length, 0);
  assert.equal(summary.bacteria.find((b) => b.key === 'escherichiacoli').value, 0);
  assert.equal(summary.germs, 2);
  assert.equal(summarizeTapWater({}), null);
});

test('summarizeBathing usa la última muestra con dato por zona', () => {
  const summary = summarizeBathing({ agrupacion_zonas: { zonas: [
    { fecha: '31/08/2026', escalera4: 'apta para el baño', escalera8: 'no recomendable para el baño', serín: '' },
    { fecha: '24/08/2026', escalera4: 'no recomendable para el baño', escalera8: 'apta para el baño', serín: 'apta para el baño' },
  ] } });
  const zone = (key) => summary.zones.find((z) => z.key === key);
  assert.equal(summary.latest, new Date(2026, 7, 31).getTime());
  assert.equal(zone('escalera4').status, 'ok');
  assert.equal(zone('escalera4').warnings, 1);
  assert.equal(zone('serín').date, new Date(2026, 7, 24).getTime());
  assert.equal(zone('vahones').status, null);
  assert.equal(bathingForBeach(summary, 'Playa de San Lorenzo').status, 'warn');
  assert.equal(bathingForBeach(summary, 'Playa de Serín').status, 'ok');
  assert.equal(bathingForBeach(summary, 'Zona sin datos'), null);
  assert.equal(summarizeBathing({}), null);
});

test('normalizeEvents ordena cronológicamente y coloca cada acto largo futuro en su fecha', () => {
  const now = new Date(2026, 10, 9, 22).getTime();
  const events = normalizeEvents([
    { id: '1', titulo: 'Expo futura', fechas: '2026-11-19\n | 2027-01-10' },
    { id: '2', titulo: 'Diciembre', fechas: '2026-12-02', hora_inicio: '19:00' },
    { id: '3', titulo: 'Mañana', fechas: '2026-11-10', hora_inicio: '12:00', hora_fin: '14:00' },
    { id: '4', titulo: 'Expo en curso', fechas: '2026-10-08\n | 2027-01-10' },
    { id: '5', titulo: 'Noviembre', fechas: '2026-11-15', hora_inicio: '18:00' },
  ], [], now);
  assert.deepEqual(events.map((e) => e.title), ['Expo en curso', 'Mañana', 'Noviembre', 'Expo futura', 'Diciembre']);
});

test('parseLineNames y compareLines', () => {
  const names = parseLineNames('Línea 14 Sotiello - Pol. Somonte, Línea 25 Tremañes - Infanzón, Línea 14 Repetida');
  assert.deepEqual([...names], [['L14', 'Sotiello - Pol. Somonte'], ['L25', 'Tremañes - Infanzón']]);
  assert.deepEqual(parseLineNames(''), new Map());
  assert.deepEqual(['B2', 'L10', 'E71', 'L2', 'B10'].sort(compareLines), ['L2', 'L10', 'B2', 'B10', 'E71']);
});

test('inDistrict trata las listas largas como toda la ciudad', () => {
  assert.equal(inDistrict('Este', 'Este'), true);
  assert.equal(inDistrict('Centro', 'Este'), false);
  assert.equal(inDistrict('Centro, Este, Llano, Sur, Oeste', 'Sur'), true);
  assert.equal(inDistrict('', 'Este'), false);
  assert.equal(inDistrict('Este', ''), false);
});

test('districtCentroids y nearestDistrict', () => {
  const centroids = districtCentroids([
    { district: 'Este', lat: 43.54, lon: -5.64 }, { district: 'Este', lat: 43.52, lon: -5.62 },
    { district: 'Oeste', lat: 43.54, lon: -5.70 }, { district: 'Centro, Este, Llano, Sur, Oeste', lat: 0, lon: 0 }, { district: '', lat: 0, lon: 0 },
  ]);
  assert.deepEqual(Object.keys(centroids).sort(), ['Este', 'Oeste']);
  assert.ok(Math.abs(centroids.Este.lat - 43.53) < 1e-9);
  assert.equal(nearestDistrict({ lat: 43.535, lon: -5.635 }, centroids), 'Este');
  assert.equal(nearestDistrict({ lat: 43.5, lon: -5.6 }, {}), '');
});

test('normalizePlaces y normalizeNotices conservan distrito y líneas', () => {
  const [place] = normalizePlaces([{ titulo: 'X', localizacion: 'Lon: -5.6, Lat: 43.54', distrito: 'Este', lineas_bus: 'Línea 10 Pumarín - Somió' }], 'parques');
  assert.equal(place.district, 'Este');
  assert.deepEqual(place.lineNames, [['L10', 'Pumarín - Somió']]);
  const [notice] = normalizeNotices([{ titulo: 'Obras', fecha_fin_html: '2099-01-01T00:00:00+0100', field_lineas_de_autobus: 'L10, L14', distrito: 'Este' }], 0);
  assert.equal(notice.district, 'Este');
  assert.deepEqual(linesAffected(notice, ['L14', 'L1']), ['L14']);
});

test('parseKml lee puntos y líneas con su carpeta y descarta lo que está fuera', () => {
  const kml = `<?xml version="1.0"?><kml><Document><name>Capa - PMUS Gijón.kml</name>
    <Folder><name>Carriles bici</name>
      <Folder><name>Carriles bici existentes</name>
        <Placemark><name>Carril bici</name><LineString><coordinates> -5.68,43.52,0 -5.67,43.53,0 </coordinates></LineString></Placemark>
      </Folder>
      <Folder><name>Tramos circulación compartida peatones-ciclistas)</name>
        <Placemark><name>Tramo</name><LineString><coordinates>-5.66,43.54,0 -5.65,43.54,0</coordinates></LineString></Placemark>
      </Folder>
    </Folder>
    <Placemark><name>Gijón Bici Acerona</name><description><![CDATA[<b>Dirección:</b> Calle Palacio Valdés</br> <a href="x">Más información</a>]]></description>
      <LookAt><longitude>-5.6</longitude><latitude>43.5</latitude></LookAt><Point><coordinates>-5.6659,43.5400,0</coordinates></Point></Placemark>
    <Placemark><name>Lejos</name><Point><coordinates>2.17,41.38,0</coordinates></Point></Placemark>
  </Document></kml>`;
  const features = parseKml(kml);
  assert.equal(features.length, 3);
  assert.equal(features[0].folder, 'Carriles bici existentes');
  assert.equal(features[0].line.length, 2);
  assert.deepEqual(features[0].line[0], { lat: 43.52, lon: -5.68 });
  assert.equal(features[1].folder, 'Tramos circulación compartida peatones-ciclistas');
  assert.equal(features[2].name, 'Gijón Bici Acerona');
  assert.equal(features[2].description, 'Dirección: Calle Palacio Valdés');
  assert.deepEqual(features[2].point, { lat: 43.54, lon: -5.6659 });
  assert.deepEqual(parseKml(''), []);
});
