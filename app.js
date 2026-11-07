'use strict';
/* IT-WORLD Routenplaner – © IT-WORLD – IT Solutions. Alle Rechte vorbehalten. */
(() => {
const APP_VERSION = '1.1.0';
const CFG = {
  owner: 'IT-WORLD – IT Solutions',
  contact: '[Bitte Name, Anschrift und E-Mail des Verantwortlichen hier eintragen]',
  year: 2026, maxStops: 60, maxFavStops: 200, maxFavLists: 100, stageSize: 10,
  nominatim: 'https://nominatim.openstreetmap.org',
  osrm: 'https://router.project-osrm.org',
  tiles: {
    osm:   { name: 'OpenStreetMap Standard', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap-Mitwirkende' },
    carto: { name: 'CARTO Dark (dunkel)', url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', attr: '© OpenStreetMap-Mitwirkende © CARTO' }
  }
};

/* ---------- Helfer ---------- */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  kids.flat().forEach(c => { if (c != null) e.append(c); });
  return e;
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sStr = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const sNum = (v, lo, hi) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const fmtKm = m => (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' km';
const fmtDur = s => { const m = Math.max(0, Math.round(s / 60)); return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std. ' + String(m % 60).padStart(2, '0') + ' Min.'; };
const fmtClock = min => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const fmtDate = t => new Date(t).toLocaleDateString('de-DE');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function sStop(o) {
  if (!o || typeof o !== 'object') return null;
  const label = sStr(o.label, 160), addr = sStr(o.addr, 240) || label;
  if (!label && !addr) return null;
  let lat = sNum(o.lat, -90, 90), lon = sNum(o.lon, -180, 180);
  if (lat == null || lon == null) { lat = null; lon = null; }
  return { id: uid(), label: label || addr, addr, note: sStr(o.note, 400), lat, lon, done: !!o.done, g: lat != null ? 'ok' : '' };
}
const cloneStop = s => ({ ...s, id: uid() });

/* ---------- Speicher (nur lokal) ---------- */
const LS = 'itw_routenplaner_v1';
let db = { consent: null, settings: { roundTrip: true, tiles: 'osm', offline: false, noStore: false, dwell: 5, time: '08:00', voice: true, every: 5, auto: true }, favStops: [], favLists: [], current: { start: null, stops: [] } };
// Gespeicherte Route prüfen (Form & Wertebereiche), damit nie Fremddaten ungeprüft ins Zeichnen/Rechnen gelangen
function sRoute(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.geom) || !Array.isArray(r.legs)) return null;
  if (r.geom.length < 2 || r.geom.length > 30000 || r.legs.length < 1 || r.legs.length > 200) return null;
  const geom = []; for (const p of r.geom) { if (!Array.isArray(p)) return null; const lo = sNum(p[0], -180, 180), la = sNum(p[1], -90, 90); if (lo == null || la == null) return null; geom.push([lo, la]); }
  const legs = []; for (const l of r.legs) {
    if (!l) return null; const d = sNum(l.d, 0, 2e7), t = sNum(l.t, 0, 1e7); if (d == null || t == null) return null;
    let st = null;
    if (Array.isArray(l.st)) {
      if (l.st.length > 600) return null; st = [];
      for (const s of l.st) { if (!s) return null; const x = sNum(s.x, -180, 180), y = sNum(s.y, -90, 90), sd = sNum(s.d, 0, 2e7); if (x == null || y == null || sd == null) return null; st.push({ ty: sStr(s.ty, 24), md: sStr(s.md, 24), n: sStr(s.n, 80), d: sd, x, y, ex: sNum(s.ex, 0, 30) || 0 }); }
    }
    legs.push(st ? { d, t, st } : { d, t });
  }
  const dist = sNum(r.dist, 0, 2e8), dur = sNum(r.dur, 0, 1e8); if (dist == null || dur == null) return null;
  return { geom, legs, dist, dur, src: r.src === 'osrm' ? 'osrm' : 'est', rt: r.rt !== false };
}
function sanitizeDb(o) {
  const out = JSON.parse(JSON.stringify(db));
  if (!o || typeof o !== 'object') return out;
  if (o.consent && typeof o.consent === 'object') out.consent = { map: !!o.consent.map, geocode: !!o.consent.geocode, route: !!o.consent.route, ts: Number(o.consent.ts) || Date.now() };
  const s = o.settings || {};
  out.settings.roundTrip = s.roundTrip !== false;
  out.settings.tiles = CFG.tiles[s.tiles] ? s.tiles : 'osm';
  out.settings.offline = !!s.offline; out.settings.noStore = !!s.noStore;
  out.settings.dwell = sNum(s.dwell, 0, 600) ?? 5;
  out.settings.time = /^\d{2}:\d{2}$/.test(s.time || '') ? s.time : '08:00';
  out.settings.voice = s.voice !== false; out.settings.auto = s.auto !== false;
  out.settings.every = [0, 3, 5, 10].includes(Number(s.every)) ? Number(s.every) : 5;
  out.favStops = (Array.isArray(o.favStops) ? o.favStops : []).slice(0, CFG.maxFavStops).map(x => { const st = sStop(x); return st ? { ...st, done: false, fid: sStr(x.fid, 60) || uid() } : null; }).filter(Boolean);
  out.favLists = (Array.isArray(o.favLists) ? o.favLists : []).slice(0, CFG.maxFavLists).map(l => {
    if (!l || typeof l !== 'object') return null;
    const name = sStr(l.name, 80); if (!name) return null;
    const st = sStop(l.start);
    return { id: sStr(l.id, 60) || uid(), name, ts: Number(l.ts) || Date.now(), roundTrip: l.roundTrip !== false, start: st ? { ...st } : null,
      stops: (Array.isArray(l.stops) ? l.stops : []).slice(0, CFG.maxStops).map(sStop).filter(Boolean).map(x => ({ ...x, done: false })) };
  }).filter(Boolean);
  const c = o.current || {};
  const cs = sStop(c.start);
  out.current = { start: cs, stops: (Array.isArray(c.stops) ? c.stops : []).slice(0, CFG.maxStops).map(sStop).filter(Boolean), route: sRoute(c.route), tour: c.tour && typeof c.tour === 'object' && ['drive', 'stay', 'end'].includes(c.tour.phase) && Number.isInteger(c.tour.idx) && c.tour.idx >= 0 && c.tour.idx <= 200 ? { phase: c.tour.phase, idx: c.tour.idx, t: sNum(c.tour.t, 0, 4e12) ?? Date.now() } : null };
  return out;
}
function loadDb() { try { const raw = localStorage.getItem(LS); if (raw) db = sanitizeDb(JSON.parse(raw)); } catch (e) { /* kein Speicher verfügbar */ } }
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (db.settings.noStore) return;
    try {
      const r = S.route;
      db.current = { start: S.start, stops: S.stops, tour: S.tour ? { phase: S.tour.phase, idx: S.tour.idx, t: S.tour.t } : null, route: r ? { geom: r.geom.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]), legs: r.legs, dist: r.dist, dur: r.dur, src: r.src, rt: db.settings.roundTrip } : null };
      localStorage.setItem(LS, JSON.stringify(db));
    }
    catch (e) { toast('Dein Browser erlaubt kein Speichern. Nutze bitte die Sicherung als Datei.', 'warn'); }
  }, 250);
}
function wipeAll() { try { localStorage.removeItem(LS); } catch (e) {} }

/* ---------- Zustand ---------- */
let S = { start: null, stops: [], route: null, sel: null, tour: null };
let net = { fails: 0, online: navigator.onLine, lastMs: null };
const consent = () => db.consent || { map: false, geocode: false, route: false };
const netOk = () => !db.settings.offline && navigator.onLine;
const canMap = () => consent().map && netOk();
const canGeo = () => consent().geocode && netOk();
const canRoute = () => consent().route && netOk();

/* ---------- Toasts & Dialoge ---------- */
function toast(msg, kind = '') {
  const t = el('div', { class: 'toast ' + kind, text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6500 : 4200);
}
function dialog({ title, body, buttons, dismiss = true, wide }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const ov = el('div', { class: 'ov', role: 'presentation' });
    const dlg = el('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const done = v => { document.removeEventListener('keydown', onKey); ov.remove(); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && dismiss) done(null); };
    document.addEventListener('keydown', onKey);
    if (dismiss) dlg.append(el('button', { class: 'icon close-x', type: 'button', 'aria-label': 'Schließen', text: '✕', onclick: () => done(null) }));
    dlg.append(el('h3', { class: 'gold', text: title }));
    [].concat(body).forEach(b => dlg.append(typeof b === 'string' ? el('p', { text: b }) : b));
    const fb = el('div', { class: 'foot-btns' });
    (buttons || [{ label: 'OK', value: true, primary: true }]).forEach(b => fb.append(el('button', { class: 'btn' + (b.primary ? '' : b.danger ? ' btn-danger' : ' btn-dark'), type: 'button', text: b.label, onclick: () => { if (b.keep) b.value(); else done(typeof b.value === 'function' ? b.value() : b.value); } })));
    dlg.append(fb); ov.append(dlg);
    if (dismiss) ov.addEventListener('pointerdown', e => { if (e.target === ov) done(null); });
    $('#modalRoot').append(ov);
    const f = dlg.querySelector('input,textarea,.btn'); if (f) f.focus();
  });
}
const ask = (title, msg, ok = 'Ja', danger = false) => dialog({ title, body: msg, buttons: [{ label: 'Abbrechen', value: false }, { label: ok, value: true, primary: !danger, danger }] });
async function promptText(title, msg, def = '', type = 'text') {
  const inp = el('input', { type, value: def, maxlength: '120', autocomplete: 'off' });
  const r = await dialog({ title, body: [msg, inp], buttons: [{ label: 'Abbrechen', value: null }, { label: 'OK', primary: true, value: () => inp.value }] });
  return r;
}

/* ---------- Netzwerk ---------- */
async function fetchJson(url, ms = 12000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: ac.signal, referrerPolicy: 'strict-origin', credentials: 'omit', mode: 'cors', cache: 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); net.fails = 0; net.lastMs = performance.now() - t0; updateConn(); return j;
  } catch (e) { net.fails++; net.lastMs = null; updateConn(); if (net.fails >= 2) showBanner('Die Verbindung klemmt gerade. Ich kann dir helfen – die Route lässt sich auch ohne Internet planen.'); throw e; }
  finally { clearTimeout(t); }
}
function updateConn() {
  const chip = $('#btnConn'), txt = $('#connText');
  chip.classList.remove('ok', 'slow', 'off');
  if (db.settings.offline) { chip.classList.add('off'); txt.textContent = 'Offline-Modus'; }
  else if (!navigator.onLine) { chip.classList.add('off'); txt.textContent = 'Kein Internet'; }
  else if (net.fails >= 2 || (net.lastMs && net.lastMs > 4000)) { chip.classList.add('slow'); txt.textContent = 'Schwacher Empfang'; }
  else { chip.classList.add('ok'); txt.textContent = 'Online'; }
}
function showBanner(msg) { $('#bannerText').textContent = msg; $('#banner').classList.remove('hidden'); }
addEventListener('online', () => { net.fails = 0; updateConn(); $('#banner').classList.add('hidden'); toast('Du bist wieder online.', 'ok'); map.resetTiles(); });
addEventListener('offline', () => { updateConn(); showBanner('Du bist gerade offline. Du kannst trotzdem weiterplanen – mit Koordinaten und geschätzten Zeiten.'); });

/* ---------- Geokodierung ---------- */
const COORD = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[;, ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;
function parseCoord(s) {
  const m = COORD.exec(s || ''); if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
  return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null;
}
let geoAbort = false;
async function geocodeOne(item) {
  const c = parseCoord(item.addr); if (c) { item.lat = c.lat; item.lon = c.lon; item.g = 'ok'; return true; }
  if (!canGeo()) { item.g = 'off'; return false; }
  for (let i = 0; i < 2; i++) {
    try {
      const j = await fetchJson(`${CFG.nominatim}/search?format=jsonv2&limit=1&accept-language=de&q=${encodeURIComponent(item.addr)}`);
      if (Array.isArray(j) && j[0]) { const lat = sNum(j[0].lat, -90, 90), lon = sNum(j[0].lon, -180, 180); if (lat != null && lon != null) { item.lat = lat; item.lon = lon; item.g = 'ok'; return true; } }
      item.g = 'err'; return false;
    } catch (e) { item.g = 'err'; await sleep(900); }
  }
  return false;
}
async function geocodeMissing(status) {
  const todo = [S.start, ...S.stops].filter(x => x && x.lat == null);
  let i = 0; geoAbort = false;
  for (const it of todo) {
    if (geoAbort) break; i++;
    it.g = 'wait'; renderAll(true); if (status) status(`Suche Adresse ${i} von ${todo.length} …`);
    const ok = await geocodeOne(it);
    if (!ok && it.g === 'off') { /* kein Dienst erlaubt */ }
    renderAll(true); save();
    if (i < todo.length && parseCoord(it.addr) == null) await sleep(1100); // Nominatim: max. 1 Anfrage/Sekunde
  }
  return todo.every(x => x.lat != null);
}

/* ---------- Distanzen & Optimierung ---------- */
const hav = (a, b) => { const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
function estMatrix(pts) {
  const n = pts.length, T = [], D = [];
  for (let i = 0; i < n; i++) { T.push([]); D.push([]); for (let j = 0; j < n; j++) { const d = i === j ? 0 : hav(pts[i], pts[j]) * 1.3; D[i][j] = d; T[i][j] = d / (50 / 3.6); } }
  return { T, D, src: 'est' };
}
async function osrmMatrix(pts) {
  const co = pts.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const j = await fetchJson(`${CFG.osrm}/table/v1/driving/${co}?annotations=duration,distance`, 20000);
  if (!j || j.code !== 'Ok' || !j.durations || !j.distances) throw new Error('table');
  const est = estMatrix(pts);
  const T = j.durations.map((r, i) => r.map((v, k) => v == null ? est.T[i][k] : v));
  const D = j.distances.map((r, i) => r.map((v, k) => v == null ? est.D[i][k] : v));
  return { T, D, src: 'osrm' };
}
function optimizeOrder(T, round) {
  const n = T.length - 1;
  const idx = Array.from({ length: n }, (_, i) => i + 1);
  if (n <= 2) return idx;
  const cost = p => { let c = T[0][p[0]]; for (let i = 0; i < p.length - 1; i++) c += T[p[i]][p[i + 1]]; if (round) c += T[p[p.length - 1]][0]; return c; };
  const improve = p => {
    let best = cost(p), changed = true, guard = 0;
    while (changed && guard++ < 60) {
      changed = false;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { // 2-opt
        const q = p.slice(0, i).concat(p.slice(i, j + 1).reverse(), p.slice(j + 1)); const c = cost(q);
        if (c < best - 1e-6) { p = q; best = c; changed = true; }
      }
      for (let len = 1; len <= 3; len++) for (let i = 0; i + len <= n; i++) { // Or-opt
        const seg = p.slice(i, i + len), rest = p.slice(0, i).concat(p.slice(i + len));
        for (let k = 0; k <= rest.length; k++) { if (k === i) continue; const q = rest.slice(0, k).concat(seg, rest.slice(k)); const c = cost(q); if (c < best - 1e-6) { p = q; best = c; changed = true; break; } }
      }
    }
    return p;
  };
  let bestP = null, bestC = Infinity;
  const starts = Math.min(n, 14);
  for (let r = 0; r < starts; r++) {
    const un = new Set(idx); let cur = 0; const p = [];
    if (r > 0) { const f = idx[(r * 7) % n]; p.push(f); un.delete(f); cur = f; }
    while (un.size) { let b = -1, bd = Infinity; for (const j of un) if (T[cur][j] < bd) { bd = T[cur][j]; b = j; } p.push(b); un.delete(b); cur = b; }
    const q = improve(p), c = cost(q); if (c < bestC) { bestC = c; bestP = q; }
  }
  return bestP;
}
const sigOf = () => (S.start ? S.start.id : '') + '|' + S.stops.map(s => s.id).join(',') + '|' + db.settings.roundTrip;

/* ---------- Route berechnen ---------- */
let calcBusy = false;
async function calcRoute(optimize) {
  if (calcBusy) return; calcBusy = true;
  const status = m => { $('#calcStatus').textContent = m; };
  try {
    if (!S.start) { toast('Setze zuerst einen Startpunkt.', 'warn'); return; }
    if (!S.stops.length) { toast('Füge mindestens ein Ziel hinzu.', 'warn'); return; }
    setBusy(true);
    await geocodeMissing(status);
    const bad = [S.start, ...S.stops].filter(x => x.lat == null);
    if (bad.length) {
      const why = !consent().geocode ? 'Die Adresssuche ist nicht erlaubt (Einwilligungen).' : !netOk() ? 'Gerade ist keine Verbindung da.' : 'Diese Adressen habe ich nicht gefunden.';
      status(`${why} Du kannst stattdessen Koordinaten eintragen (z. B. 48,7758 9,1829).`);
      if (bad.includes(S.start)) { toast('Der Startpunkt hat noch keine Position.', 'err'); return; }
    }
    const valid = S.stops.filter(s => s.lat != null);
    const invalid = S.stops.filter(s => s.lat == null);
    if (!valid.length) { toast('Kein Ziel hat eine Position. Prüfe die Schreibweise oder nutze Koordinaten.', 'err'); return; }
    const pts = [S.start, ...valid];
    status('Berechne Entfernungen …');
    let M; try { M = canRoute() ? await osrmMatrix(pts) : estMatrix(pts); } catch (e) { M = estMatrix(pts); }
    let order = valid.map((_, i) => i + 1);
    if (optimize === 'dist') { status('Sortiere nach Entfernung …'); order = order.slice().sort((x, y) => M.D[0][x] - M.D[0][y]); } // nah → fern (Entfernung vom Start)
    else if (optimize) { status('Suche die beste Reihenfolge …'); await sleep(30); order = optimizeOrder(M.T, db.settings.roundTrip); }
    const ordered = order.map(i => pts[i]);
    S.stops = ordered.concat(invalid);
    // Route entlang der Straßen
    const seq = [S.start, ...ordered].concat(db.settings.roundTrip ? [S.start] : []);
    const idxSeq = [0, ...order].concat(db.settings.roundTrip ? [0] : []);
    const legs = []; let geom = null, src = M.src, dist = 0, dur = 0;
    for (let i = 0; i < idxSeq.length - 1; i++) legs.push({ d: M.D[idxSeq[i]][idxSeq[i + 1]], t: M.T[idxSeq[i]][idxSeq[i + 1]] });
    if (canRoute()) {
      try {
        status('Zeichne die Route …');
        const co = seq.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
        const j = await fetchJson(`${CFG.osrm}/route/v1/driving/${co}?overview=full&geometries=geojson&steps=true`, 40000);
        if (j && j.code === 'Ok' && j.routes && j.routes[0]) {
          const r = j.routes[0]; geom = r.geometry.coordinates.map(c => [c[0], c[1]]); src = 'osrm';
          if (r.legs && r.legs.length === legs.length) r.legs.forEach((l, i) => { legs[i] = { d: l.distance, t: l.duration, st: compactSteps(l.steps) }; });
        }
      } catch (e) { /* Näherung nutzen */ }
    }
    if (!geom) { geom = seq.map(p => [p.lon, p.lat]); if (src !== 'osrm') src = 'est'; }
    legs.forEach(l => { dist += l.d; dur += l.t; });
    S.route = { geom, legs, dist, dur, src, sig: sigOf() };
    status(invalid.length ? `${invalid.length} Ziel(e) ohne Position wurden nicht berücksichtigt.` : (src === 'est' ? 'Fertig – Zeiten sind geschätzt (ohne Straßendaten).' : 'Fertig!'));
    renderAll(); map.fit(); save();
    if (optimize === 'dist') toast('Nach Entfernung sortiert: nah → fern 📏', 'ok');
    else if (optimize) toast('Beste Reihenfolge gefunden ✨', 'ok');
  } finally { calcBusy = false; setBusy(false); }
}
// Fahranweisungen je Etappe kompakt ablegen (werden mit der Route gespeichert, damit sie auch ohne Netz da sind)
function compactSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map(s => {
    const m = (s && s.maneuver) || {}, loc = Array.isArray(m.location) ? m.location : [];
    return { ty: sStr(m.type, 24), md: sStr(m.modifier, 24), n: sStr(s && s.name, 80), d: Math.round(Number(s && s.distance) || 0), x: loc[0], y: loc[1], ex: Number.isInteger(m.exit) ? m.exit : 0 };
  }).filter(s => Number.isFinite(s.x) && Number.isFinite(s.y)).slice(0, 600);
}
function setBusy(b) { ['btnOptimize', 'btnDist', 'btnRecalc'].forEach(id => $('#' + id).disabled = b); }

/* ---------- Rendern ---------- */
function navLinks(p) {
  const has = p.lat != null; const ll = has ? `${p.lat},${p.lon}` : null; const q = encodeURIComponent(has ? ll : p.addr);
  return [
    ['Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`],
    ['Apple Karten', `https://maps.apple.com/?daddr=${q}&dirflg=d`],
    has ? ['Waze', `https://waze.com/ul?ll=${ll}&navigate=yes`] : null
  ].filter(Boolean);
}
function statEl(s) {
  const m = { ok: ['✓ Position gefunden', 'ok'], wait: ['… suche', 'wait'], err: ['! nicht gefunden', 'err'], off: ['– Adresssuche aus', 'err'] }[s.g];
  return m ? el('span', { class: 's-stat ' + m[1], text: m[0] }) : null;
}
const openNav = new Set(); let editing = null;
function renderStops() {
  const ul = $('#stopList'); ul.replaceChildren();
  const fresh = S.route && S.route.sig === sigOf();
  const legAt = i => (fresh && S.route.legs[i]) || null;
  let clock = parseTime(db.settings.time) + 0;
  const live = tourEtas(), curId = S.tour && live && S.stops[S.tour.idx] ? S.stops[S.tour.idx].id : null;
  S.stops.forEach((s, i) => {
    const leg = legAt(i); if (leg) { clock += leg.t / 60; s._eta = clock; clock += db.settings.dwell; } else s._eta = null;
    if (live && live.eta[i] != null) s._eta = live.eta[i];
    const li = el('li', { class: 'stop' + (s.done ? ' done' : '') + (S.sel === s.id ? ' sel' : '') + (curId === s.id ? ' cur' : ''), 'data-id': s.id });
    li.append(el('div', { class: 'badge', text: String(i + 1) }));
    const main = el('div', { class: 's-main' });
    if (editing === s.id) {
      const iL = el('input', { type: 'text', value: s.label, maxlength: '160', 'aria-label': 'Name' });
      const iA = el('input', { type: 'text', value: s.addr, maxlength: '240', 'aria-label': 'Adresse oder Koordinaten' });
      const iN = el('input', { type: 'text', value: s.note, maxlength: '400', placeholder: 'Notiz (optional)', 'aria-label': 'Notiz' });
      main.append(el('div', { class: 's-edit' }, iL, iA, iN, el('div', { class: 's-tools' },
        el('button', { class: 'btn btn-sm', type: 'button', text: 'Speichern', onclick: () => {
          const nl = sStr(iL.value, 160), na = sStr(iA.value, 240) || nl; if (!nl && !na) return toast('Bitte gib einen Namen oder eine Adresse ein.', 'warn');
          if (na !== s.addr) { s.lat = null; s.lon = null; s.g = ''; S.route = null; }
          s.label = nl || na; s.addr = na; s.note = sStr(iN.value, 400); editing = null; renderAll(); save();
        } }), el('button', { class: 'btn btn-sm btn-dark', type: 'button', text: 'Abbrechen', onclick: () => { editing = null; renderStops(); } }))));
    } else {
      main.append(el('div', { class: 's-label', text: s.label }));
      if (s.addr && s.addr !== s.label) main.append(el('div', { class: 's-addr', text: s.addr }));
      if (s.note) main.append(el('div', { class: 's-note', text: '📝 ' + s.note }));
      if (leg) {
        main.append(el('div', { class: 's-leg', text: `Ankunft ca. ${fmtClock(s._eta)} · ${fmtKm(leg.d)}, ${fmtDur(leg.t)} ab ${i === 0 ? 'Start' : 'Ziel ' + i}` }));
        const nx = legAt(i + 1), last = i === S.stops.length - 1 || !S.stops[i + 1] || S.stops[i + 1].lat == null;
        if (!last && nx) main.append(el('div', { class: 's-next', text: `➜ Weiter zum nächsten Ziel: ${fmtDur(nx.t)} · ${fmtKm(nx.d)}` }));
        else if (db.settings.roundTrip && nx) main.append(el('div', { class: 's-next', text: `➜ Zurück zum Start: ${fmtDur(nx.t)} (${fmtKm(nx.d)})` }));
        else main.append(el('div', { class: 's-next', text: '🏁 Letztes Ziel' }));
      }
      const st = statEl(s); if (st) main.append(st);
      const tools = el('div', { class: 's-tools' });
      tools.append(el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: s.done ? '' : null, onchange: e => { s.done = e.target.checked; renderAll(true); save(); } }), 'erledigt'));
      const isFav = db.favStops.some(f => f.addr === s.addr && f.label === s.label);
      tools.append(el('button', { class: 'icon' + (isFav ? ' on' : ''), type: 'button', title: isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten', 'aria-label': 'Favorit', text: '★', onclick: () => toggleFavStop(s) }));
      tools.append(el('button', { class: 'icon', type: 'button', title: 'Bearbeiten', 'aria-label': 'Bearbeiten', text: '✎', onclick: () => { editing = s.id; renderStops(); } }));
      tools.append(el('button', { class: 'icon', type: 'button', title: 'Nach oben', 'aria-label': 'Nach oben', text: '↑', disabled: i === 0 ? '' : null, onclick: () => moveStop(i, -1) }));
      tools.append(el('button', { class: 'icon', type: 'button', title: 'Nach unten', 'aria-label': 'Nach unten', text: '↓', disabled: i === S.stops.length - 1 ? '' : null, onclick: () => moveStop(i, 1) }));
      tools.append(el('button', { class: 'icon', type: 'button', title: 'Navigieren', 'aria-label': 'Navigieren', text: '➤', onclick: () => { openNav.has(s.id) ? openNav.delete(s.id) : openNav.add(s.id); renderStops(); } }));
      tools.append(el('button', { class: 'icon', type: 'button', title: 'Entfernen', 'aria-label': 'Entfernen', text: '✕', onclick: () => { S.stops.splice(i, 1); S.route = null; renderAll(); save(); } }));
      main.append(tools);
      if (curId === s.id) main.append(el('div', { class: 's-tools' },
        el('button', { class: 'btn btn-sm', type: 'button', text: '➜ Nächstes Ziel starten', onclick: () => tourNext() }),
        el('button', { class: 'btn btn-sm btn-dark', type: 'button', text: '⏭ Aufenthalt überspringen', onclick: tourSkip })));
      if (openNav.has(s.id)) main.append(el('div', { class: 'nav-pop' }, navLinks(s).map(([n, u]) => el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: n }))));
    }
    main.addEventListener('click', e => { if (e.target.closest('button,a,input,label')) return; S.sel = s.id; renderStops(); map.draw(); });
    li.append(main); ul.append(li);
  });
  $('#stopCount').textContent = String(S.stops.length);
  $('#emptyHint').classList.toggle('hidden', S.stops.length > 0);
}
function parseTime(t) { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : 480; }
function moveStop(i, d) { const j = i + d; if (j < 0 || j >= S.stops.length) return; [S.stops[i], S.stops[j]] = [S.stops[j], S.stops[i]]; S.route = null; renderAll(); save(); }

function summaryText() {
  const fresh = S.route && S.route.sig === sigOf(); const L = [];
  L.push('IT-WORLD Routenplaner – ' + new Date().toLocaleDateString('de-DE'));
  if (S.start) L.push('Start: ' + S.start.label + (S.start.lat != null ? ` (${S.start.lat.toFixed(5)}, ${S.start.lon.toFixed(5)})` : ''));
  S.stops.forEach((s, i) => { const leg = fresh && S.route.legs[i]; L.push(`${i + 1}. ${s.label}${s.addr !== s.label ? ' – ' + s.addr : ''}${s.lat != null ? ` [${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}]` : ''}${leg ? ` | Ankunft ca. ${fmtClock(s._eta)}${fresh && S.route.legs[i + 1] && i < S.stops.length - 1 ? ', weiter zum nächsten Ziel: ' + fmtDur(S.route.legs[i + 1].t) : ''}` : ''}${s.note ? ' | Notiz: ' + s.note : ''}`); });
  if (fresh) { const T = totals(); L.push(`Gesamt: ${fmtKm(S.route.dist)}, Fahrzeit ${fmtDur(T.drive)}, Gesamtdauer bis zum letzten Ziel ${fmtDur(T.total)}${T.back ? ', Rückfahrt ' + fmtDur(T.back) : ''}${S.route.src === 'est' ? ' (geschätzt)' : ''}`); }
  return L.join('\n');
}
function totals() {
  const r = S.route, rt = db.settings.roundTrip, nS = r.legs.length - (rt ? 1 : 0), dw = db.settings.dwell * 60;
  let drive = 0; for (let j = 0; j < nS; j++) drive += r.legs[j].t;
  const total = drive + dw * nS;
  let k = S.stops.slice(0, nS).findIndex(x => !x.done), remaining = 0;
  if (k >= 0) for (let j = k; j < nS; j++) remaining += r.legs[j].t + (S.stops[j].done ? 0 : dw);
  return { drive, total, remaining, back: rt ? r.legs[nS].t : 0, nS, open: k < 0 ? 0 : S.stops.slice(0, nS).filter(x => !x.done).length };
}
function renderSummary() {
  const box = $('#summary'); box.replaceChildren();
  const fresh = S.route && S.route.sig === sigOf();
  if (!fresh) {
    box.append(el('p', { class: 'hint', text: S.route ? 'Die Liste wurde geändert – berechne die Route neu, dann stimmen Strecke und Zeiten wieder.' : 'Sobald du eine Route berechnet hast, siehst du hier Strecke, Fahrzeit und Ankunftszeiten.' }));
    $('#exportRow').classList.toggle('hidden', !S.stops.length); return;
  }
  const r = S.route, dwellTotal = db.settings.dwell * S.stops.length;
  const endMin = parseTime(db.settings.time) + r.dur / 60 + dwellTotal;
  const T = totals();
  box.append(el('div', { class: 'kpis' },
    kpi(fmtDur(T.total), 'Gesamtdauer bis letztes Ziel erledigt'), kpi(T.open ? fmtDur(T.remaining) : '✓ Fertig', T.open ? `Noch offen (${T.open} Ziele)` : 'Alles erledigt'),
    kpi(fmtKm(r.dist), 'Strecke'), kpi(fmtDur(T.drive), 'Reine Fahrzeit')));
  box.append(el('p', { class: 'hint', text: `Gesamtdauer = Fahrzeit + ${db.settings.dwell} Min. Aufenthalt je Ziel${T.back ? '. Rückfahrt zum Start kommt mit ' + fmtDur(T.back) + ' noch dazu' : ''}. „Noch offen“ rechnet live mit, sobald du Ziele abhakst.` }));
  const tl = el('ol', { class: 'timeline' });
  tl.append(el('li', {}, el('time', { text: fmtClock(parseTime(db.settings.time)) }), el('span', { text: 'Start: ' + S.start.label })));
  const lv = tourEtas();
  S.stops.forEach((s, i) => { if (s._eta != null) tl.append(el('li', {}, el('time', { text: s.done && S.tour ? '✓' : fmtClock(s._eta) }), el('span', { text: `${i + 1}. ${s.label}` }))); });
  if (db.settings.roundTrip) tl.append(el('li', {}, el('time', { text: fmtClock(lv ? lv.finish + T.back / 60 : endMin) }), el('span', { text: 'Zurück am Start' })));
  box.append(tl);
  box.append(el('p', { class: 'hint', text: r.src === 'osrm' ? 'Straßenroute über OSRM berechnet. Verkehr und Baustellen sind nicht berücksichtigt.' : 'Ohne Straßendaten geschätzt (Luftlinie × 1,3, etwa 50 km/h). Erlaube die Routenberechnung für genauere Werte.' }));
}
const kpi = (v, l) => el('div', { class: 'kpi' }, el('b', { class: 'gold', text: v }), el('span', { text: l }));

function renderStages() {
  const box = $('#stages'); box.replaceChildren();
  const pts = [S.start, ...S.stops].filter(Boolean);
  if (!S.start || !S.stops.length) { box.append(el('p', { class: 'hint', text: 'Hier erscheinen die Etappen, sobald Start und Ziele gesetzt sind.' })); return; }
  const ref = p => encodeURIComponent(p.lat != null ? `${p.lat},${p.lon}` : p.addr);
  let origin = S.start, n = 0;
  for (let i = 0; i < S.stops.length; i += CFG.stageSize) {
    const chunk = S.stops.slice(i, i + CFG.stageSize); const dest = chunk[chunk.length - 1]; const way = chunk.slice(0, -1);
    n++;
    let url = `https://www.google.com/maps/dir/?api=1&origin=${ref(origin)}&destination=${ref(dest)}&travelmode=driving`;
    if (way.length) url += '&waypoints=' + way.map(ref).join('%7C');
    box.append(el('div', { class: 'stage' }, el('span', { text: `Etappe ${n}: Stopp ${i + 1}–${i + chunk.length}` }),
      el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: 'In Google Maps öffnen' })));
    origin = dest;
  }
  if (db.settings.roundTrip) {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${ref(origin)}&destination=${ref(S.start)}&travelmode=driving`;
    box.append(el('div', { class: 'stage' }, el('span', { text: 'Rückfahrt zum Start' }), el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: 'In Google Maps öffnen' })));
  }
}
function renderStart() {
  const info = $('#startInfo');
  info.textContent = S.start ? `Start: ${S.start.label}${S.start.lat != null ? '' : ' (Position wird beim Berechnen gesucht)'}` : 'Noch kein Startpunkt gesetzt.';
}
function toggleFavStop(s) {
  const i = db.favStops.findIndex(f => f.addr === s.addr && f.label === s.label);
  if (i >= 0) { db.favStops.splice(i, 1); toast('Favorit entfernt.'); }
  else { if (db.favStops.length >= CFG.maxFavStops) return toast('Maximal 200 Favoriten.', 'warn'); db.favStops.push({ ...cloneStop(s), done: false, fid: uid() }); toast('Als Favorit gespeichert ★', 'ok'); }
  renderAll(true); save();
}
let editingFav = null;
function renderFavs() {
  const ul = $('#favStopList'); ul.replaceChildren();
  db.favStops.forEach((f, i) => {
    const li = el('li', { class: 'fav' });
    const main = el('div', { class: 's-main' });
    if (editingFav === f.fid) {
      const iL = el('input', { type: 'text', value: f.label, maxlength: '160', 'aria-label': 'Name' }), iA = el('input', { type: 'text', value: f.addr, maxlength: '240', 'aria-label': 'Adresse' });
      main.append(el('div', { class: 's-edit' }, iL, iA, el('div', { class: 's-tools' },
        el('button', { class: 'btn btn-sm', type: 'button', text: 'Speichern', onclick: () => { const nl = sStr(iL.value, 160), na = sStr(iA.value, 240) || nl; if (!nl) return; if (na !== f.addr) { f.lat = null; f.lon = null; f.g = ''; } f.label = nl; f.addr = na; editingFav = null; renderFavs(); save(); } }),
        el('button', { class: 'btn btn-sm btn-dark', type: 'button', text: 'Abbrechen', onclick: () => { editingFav = null; renderFavs(); } }))));
      li.append(main);
    } else {
      main.append(el('div', { class: 's-label', text: f.label })); if (f.addr !== f.label) main.append(el('div', { class: 's-addr', text: f.addr }));
      const tools = el('div', { class: 'row wrap' },
        el('button', { class: 'icon', type: 'button', title: 'Zur Route hinzufügen', 'aria-label': 'Zur Route hinzufügen', text: '＋', onclick: () => addStopObj(cloneStop(f)) }),
        el('button', { class: 'icon', type: 'button', title: 'Bearbeiten', 'aria-label': 'Favorit bearbeiten', text: '✎', onclick: () => { editingFav = f.fid; renderFavs(); } }),
        el('button', { class: 'icon', type: 'button', title: 'Löschen', 'aria-label': 'Favorit löschen', text: '✕', onclick: () => { db.favStops.splice(i, 1); renderAll(true); save(); } }));
      li.append(main, tools);
    }
    ul.append(li);
  });
  $('#favStopEmpty').classList.toggle('hidden', db.favStops.length > 0);
  $('#favStopCount').textContent = String(db.favStops.length);
  const ll = $('#favListList'); ll.replaceChildren();
  db.favLists.forEach((l, i) => {
    const li = el('li', { class: 'fav' });
    li.append(el('div', { class: 's-main' }, el('div', { class: 's-label', text: l.name }), el('div', { class: 's-addr', text: `${l.stops.length} Ziele · gespeichert am ${fmtDate(l.ts)}${l.start ? ' · Start: ' + l.start.label : ''}` })));
    li.append(el('div', { class: 'row wrap' },
      el('button', { class: 'btn btn-sm', type: 'button', text: 'Laden', onclick: () => loadList(l, false) }),
      el('button', { class: 'icon', type: 'button', title: 'An aktuelle Liste anhängen', 'aria-label': 'Anhängen', text: '＋', onclick: () => loadList(l, true) }),
      el('button', { class: 'icon', type: 'button', title: 'Mit aktueller Liste überschreiben', 'aria-label': 'Überschreiben', text: '⟳', onclick: () => overwriteList(l) }),
      el('button', { class: 'icon', type: 'button', title: 'Umbenennen', 'aria-label': 'Umbenennen', text: '✎', onclick: async () => { const n = await promptText('Liste umbenennen', 'Neuer Name:', l.name); const nn = sStr(n || '', 80); if (nn) { l.name = nn; renderFavs(); save(); } } }),
      el('button', { class: 'icon', type: 'button', title: 'Löschen', 'aria-label': 'Liste löschen', text: '✕', onclick: async () => { if (await ask('Liste löschen?', `„${l.name}“ wird endgültig entfernt.`, 'Löschen', true)) { db.favLists.splice(i, 1); renderFavs(); save(); } } })));
    ll.append(li);
  });
  $('#favListEmpty').classList.toggle('hidden', db.favLists.length > 0);
  $('#favListCount').textContent = String(db.favLists.length);
}
function currentAsList(name, id) {
  return { id: id || uid(), name, ts: Date.now(), roundTrip: db.settings.roundTrip, start: S.start ? { ...S.start, done: false } : null, stops: S.stops.map(s => ({ ...s, done: false })) };
}
async function saveList() {
  const name = sStr($('#favListName').value, 80);
  if (!name) return toast('Gib der Liste bitte einen Namen.', 'warn');
  if (!S.stops.length) return toast('Die aktuelle Liste ist leer.', 'warn');
  const ex = db.favLists.find(l => l.name.toLowerCase() === name.toLowerCase());
  if (ex) { if (!(await ask('Liste überschreiben?', `Es gibt schon eine Liste „${ex.name}“. Soll sie ersetzt werden?`, 'Ersetzen'))) return; Object.assign(ex, currentAsList(ex.name, ex.id)); }
  else { if (db.favLists.length >= CFG.maxFavLists) return toast('Maximal 100 Listen.', 'warn'); db.favLists.unshift(currentAsList(name)); }
  $('#favListName').value = ''; renderFavs(); save(); toast('Liste gespeichert ★', 'ok');
}
async function overwriteList(l) {
  if (!S.stops.length) return toast('Die aktuelle Liste ist leer.', 'warn');
  if (!(await ask('Liste überschreiben?', `„${l.name}“ wird durch deine aktuelle Liste ersetzt.`, 'Ersetzen'))) return;
  Object.assign(l, currentAsList(l.name, l.id)); renderFavs(); save(); toast('Liste aktualisiert.', 'ok');
}
async function loadList(l, append) {
  if (!append && S.stops.length && !(await ask('Aktuelle Liste ersetzen?', `Deine aktuelle Liste (${S.stops.length} Ziele) wird durch „${l.name}“ ersetzt.`, 'Ersetzen'))) return;
  const add = l.stops.map(cloneStop);
  if (append) { if (S.stops.length + add.length > CFG.maxStops) return toast('Das wären mehr als 60 Ziele.', 'warn'); S.stops.push(...add); }
  else { S.stops = add; if (l.start) S.start = cloneStop(l.start); db.settings.roundTrip = l.roundTrip; $('#optRound').checked = l.roundTrip; }
  S.route = null; S.sel = null; renderAll(); map.fit(); save(); toast(append ? 'Ziele angehängt.' : `„${l.name}“ geladen.`, 'ok');
}
function renderAll(keepRoute) { renderStart(); renderStops(); renderSummary(); renderTour(); renderStages(); renderFavs(); map.draw(); if (NAV.open) navRender(); }


/* ---------- Live-Tour: „Nächstes Ziel starten“ ---------- */
const minOfDay = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const tourFresh = () => S.route && S.route.sig === sigOf();
const tourN = () => S.route.legs.length - (db.settings.roundTrip ? 1 : 0);
function tourEtas() {
  const T = S.tour; if (!T || !tourFresh() || T.phase === 'end') return null;
  const L = S.route.legs, nS = tourN(), dw = db.settings.dwell; if (T.idx >= nS) return null;
  const now = minOfDay(Date.now()), eta = Array(S.stops.length).fill(null); let depart;
  if (T.phase === 'drive') { const a = Math.max(now, minOfDay(T.t) + L[T.idx].t / 60); eta[T.idx] = a; depart = a + dw; }
  else depart = now + Math.max(0, (T.t + dw * 60000 - Date.now()) / 60000);
  for (let k = T.idx + 1; k < nS; k++) { const a = depart + L[k].t / 60; eta[k] = a; depart = a + dw; }
  return { eta, finish: depart };
}
function tourStart() {
  if (!tourFresh()) return toast('Berechne zuerst die Route, dann kann die Tour starten.', 'warn');
  const nS = tourN(), k = S.stops.slice(0, nS).findIndex(x => !x.done);
  if (k < 0) return toast('Alle Ziele sind schon erledigt.', 'warn');
  S.tour = { phase: 'drive', idx: k, t: Date.now(), alerted: false }; S.sel = S.stops[k].id; renderAll(); save(); toast('Gute Fahrt! Die Zeiten laufen ab jetzt live mit. 🚗', 'ok');
  if (NAV.open) setTimeout(() => navStatus('Tour gestartet.'), 1500);
}
function tourArrived() { const T = S.tour; if (!T) return; T.phase = 'stay'; T.t = Date.now(); T.alerted = false; renderAll(); save(); if (NAV.open) setTimeout(() => navStatus('Angekommen.'), 400); }
function tourNext(msg) {
  const T = S.tour; if (!T || !tourFresh()) return; const nS = tourN();
  if (S.stops[T.idx]) S.stops[T.idx].done = true;
  T.idx++; T.t = Date.now(); T.alerted = false;
  if (T.idx >= nS) { T.phase = 'end'; toast('Alle Ziele erledigt 🏁', 'ok'); }
  else { T.phase = 'drive'; S.sel = S.stops[T.idx].id; toast(`${msg || 'Weiter'} zu Ziel ${T.idx + 1}: ${S.stops[T.idx].label}`, 'ok'); }
  renderAll(); save(); if (NAV.open) setTimeout(() => navStatus(T.phase === 'end' ? 'Alle Ziele erledigt.' : 'Weiter.'), 400);
  if (T.phase === 'drive') { const li = $(`[data-id="${S.stops[T.idx].id}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }
}
const tourSkip = () => tourNext('Aufenthalt übersprungen – weiter');
const gLink = p => navLinks(p)[0][1];
function navBtn(p, label, cls, onclick) { return el('a', { class: 'btn ' + cls, href: gLink(p), target: '_blank', rel: 'noopener noreferrer', text: label, onclick }); }
/* Die Weiterfahrt-Buttons (3D): Karte und Dock nutzen denselben Aufbau */
function tourButtons() {
  const T = S.tour, out = [], nS = tourFresh() ? tourN() : 0;
  if (!tourFresh()) {
    if (S.start && S.stops.length) out.push(el('button', { class: 'btn btn-go', type: 'button', text: '📏 Nach Entfernung sortieren & Tour starten', onclick: async () => { await calcRoute('dist'); if (tourFresh()) tourStart(); } }));
    return out;
  }
  if (!nS) return out;
  out.push(el('button', { class: 'btn btn-go', type: 'button', text: T ? '🧭 Fahrmodus öffnen (Sprache)' : '🧭 Fahrmodus starten · Sprachführung', onclick: () => { if (!T) { tourStart(); navOpen(); setTimeout(() => navStatus('Tour gestartet.'), 1800); } else navOpen(); } }));
  if (!T) {
    const k = S.stops.slice(0, nS).findIndex(x => !x.done); if (k < 0) return out;
    out.push(navBtn(S.stops[k], `▶ Tour starten · Anfahrt zu Ziel ${k + 1}`, 'btn-go', () => setTimeout(tourStart, 60)));
    return out;
  }
  if (T.phase === 'end') return out;
  const tgt = S.stops[T.idx], nxt = S.stops[T.idx + 1], hasNext = T.idx + 1 < nS && nxt;
  if (T.phase === 'drive') {
    out.push(navBtn(tgt, `🚗 Anfahrt starten · Ziel ${T.idx + 1}`, 'btn-go', () => { T.t = Date.now(); save(); }));
    out.push(el('button', { class: 'btn', type: 'button', text: '📍 Angekommen', onclick: tourArrived }));
  } else {
    if (hasNext) out.push(navBtn(nxt, `➜ Nächstes Ziel starten · Anfahrt (${T.idx + 2})`, 'btn-go', () => setTimeout(() => tourNext('Anfahrt'), 60)));
    else out.push(el('button', { class: 'btn btn-go', type: 'button', text: '🏁 Letztes Ziel abschließen', onclick: () => tourNext() }));
  }
  out.push(el('button', { class: 'btn btn-dark', type: 'button', text: '⏭ Aufenthalt überspringen', onclick: tourSkip }));
  return out;
}
function renderTour() {
  const box = $('#tourBox'), dock = $('#dock'); box.replaceChildren(); dock.replaceChildren();
  if (S.tour && !tourFresh()) S.tour = null;
  const T = S.tour, fresh = tourFresh(), btns = () => tourButtons();
  const dockBtns = btns(); dock.classList.toggle('hidden', !dockBtns.length); document.body.classList.toggle('has-dock', dockBtns.length > 0);
  if (dockBtns.length) { dock.append(el('div', { class: 'dock-info', id: 'dockInfo' })); dockBtns.forEach(b => dock.append(b)); }
  if (!T) {
    box.append(el('p', { class: 'hint', text: 'Starte die Tour, wenn du losfährst. Dann siehst du dein aktuelles Ziel in 3D und kannst mit „Nächstes Ziel starten“ oder „Aufenthalt überspringen“ jederzeit weiterfahren – auch früher als geplant. Ankunftszeiten und Restdauer passen sich sofort an.' }));
    if (btns().length) box.append(el('div', { class: 'row wrap go-row' }, btns())); else box.append(el('p', { class: 'hint', text: 'Setze einen Startpunkt und füge Ziele hinzu, dann stehen die Buttons bereit.' }));
    return;
  }
  const nS = tourN();
  if (T.phase === 'end') {
    box.append(el('div', { class: 'target3d done3d' }, el('div', { class: 'coin' }, el('span', { text: '🏁' })), el('div', { class: 'plaque' }, el('b', { text: 'Alle Ziele erledigt' }), el('small', { text: 'Starke Leistung – Tour abgeschlossen.' }))));
    if (db.settings.roundTrip && S.start) box.append(el('div', { class: 'row wrap go-row' }, navBtn(S.start, '🚗 Rückfahrt zum Start', 'btn-go', null)));
    box.append(el('button', { class: 'btn btn-dark btn-sm', type: 'button', text: 'Tour beenden', onclick: () => { S.tour = null; renderAll(); save(); } }));
    return;
  }
  const tgt = S.stops[T.idx], leg = S.route.legs[T.idx];
  box.append(el('div', { class: 'target3d' },
    el('div', { class: 'coin' }, el('span', { text: String(T.idx + 1) })),
    el('div', { class: 'plaque' },
      el('small', { class: 't-phase', text: `${T.phase === 'drive' ? 'UNTERWEGS ZU' : 'VOR ORT BEI'} ZIEL ${T.idx + 1} VON ${nS}` }),
      el('b', { text: tgt.label }), tgt.addr !== tgt.label ? el('small', { text: tgt.addr }) : null,
      el('div', { class: 't-info', text: `Anfahrt: ${fmtDur(leg.t)} · ${fmtKm(leg.d)}` }),
      el('div', { class: 's-leg', id: 'tourLive' }))));
  box.append(el('div', { class: 'row wrap go-row' }, btns()));
  box.append(el('div', { class: 's-next', id: 'tourFin' }));
  box.append(el('button', { class: 'btn btn-dark btn-sm', type: 'button', text: 'Tour beenden', onclick: async () => { if (await ask('Tour beenden?', 'Die Live-Zeiten stoppen. Erledigte Ziele bleiben abgehakt.', 'Beenden')) { S.tour = null; renderAll(); save(); } } }));
  updateTourLive();
}
function updateTourLive() {
  const T = S.tour; if (!T || T.phase === 'end') return; const live = tourEtas(), dw = db.settings.dwell * 60000;
  const lv = $('#tourLive'), fin = $('#tourFin'), di = $('#dockInfo'); let line = '';
  if (T.phase === 'stay') {
    const rem = (T.t + dw - Date.now()) / 1000, a = Math.abs(Math.floor(rem)), m = Math.floor(a / 60), sec = String(a % 60).padStart(2, '0');
    line = rem > 0 ? `⏱ Aufenthalt: noch ${m}:${sec} von ${db.settings.dwell} Min. – du kannst früher los` : `⏱ Aufenthalt vorbei seit ${m}:${sec}`;
    if (rem <= 0 && !T.alerted) { T.alerted = true; toast('Aufenthalt vorbei – Zeit für das nächste Ziel.', 'warn'); try { navigator.vibrate && navigator.vibrate(250); } catch (e) {} }
  } else { const eta = live && live.eta[T.idx]; line = eta != null ? `Ankunft ca. ${fmtClock(eta)}` : ''; }
  if (lv) lv.textContent = line;
  const finTxt = live ? `Voraussichtlich alles erledigt um ${fmtClock(live.finish)} (in ${fmtDur(Math.max(0, Math.round(live.finish - minOfDay(Date.now()))) * 60)})` : '';
  if (fin) fin.textContent = finTxt;
  if (di) di.textContent = `Ziel ${T.idx + 1}${S.stops[T.idx] ? ': ' + S.stops[T.idx].label : ''} · ${line}${finTxt ? ' · ' + finTxt.replace('Voraussichtlich alles erledigt um', 'Fertig um').replace(/\(in .*\)/, '') : ''}`;
}
setInterval(() => { if (S.tour) updateTourLive(); }, 1000);
setInterval(() => { if (S.tour && S.tour.phase !== 'end') renderStops(); }, 20000);

/* ---------- Fahrmodus: Abbiegehinweise, Sprachausgabe, Fernanzeige ---------- */
const NAV = { follow: true, mapHome: null, open: false, watch: null, pos: null, acc: null, fix: 0, err: 0, legKey: '', si: 0, said: {}, view: null, lastSpeech: 0, lastStatus: 0, lastText: '', wl: null, ui: null, btnKey: '', timer: null };
const NAV_SKIP = ['depart', 'arrive', 'new name', 'continue', 'notification', 'exit roundabout', 'exit rotary', 'exit roundabout turn'];
const DIRS = { left: 'links', right: 'rechts', 'slight left': 'leicht links', 'slight right': 'leicht rechts', 'sharp left': 'scharf links', 'sharp right': 'scharf rechts', straight: 'geradeaus' };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1), low = s => s.charAt(0).toLowerCase() + s.slice(1);
const clockSay = min => { const m = ((Math.round(min) % 1440) + 1440) % 1440, h = Math.floor(m / 60), mm = m % 60; return mm ? `${h} Uhr ${mm}` : `${h} Uhr`; };
function dSay(m) { if (m >= 950) { const k = Math.round(m / 100) / 10; return k === 1 ? 'einem Kilometer' : `${k.toLocaleString('de-DE')} Kilometern`; } return `${m > 150 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)} Metern`; }
const dShow = m => m >= 1000 ? (m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km' : Math.max(0, Math.round(m / 10) * 10) + ' m';
function mSay(s) { // klare deutsche Anweisung mit Straßenname
  const nm = s.n ? ` auf ${s.n}` : '', md = s.md || '', dir = DIRS[md] || '';
  switch (s.ty) {
    case 'roundabout': case 'rotary': case 'roundabout turn': case 'rotary turn':
      return s.ex ? `Im Kreisverkehr die ${s.ex}. Ausfahrt nehmen${nm}` : `In den Kreisverkehr einfahren${nm}`;
    case 'end of road': return md === 'uturn' ? 'Wenden' : `Am Ende der Straße ${dir && dir !== 'geradeaus' ? dir + ' abbiegen' : 'weiterfahren'}${nm}`;
    case 'fork': return `${dir && dir !== 'geradeaus' ? cap(dir) + ' halten' : 'Geradeaus halten'}${nm}`;
    case 'on ramp': return `Auffahrt ${dir ? dir + ' ' : ''}nehmen${nm}`;
    case 'off ramp': return `Ausfahrt ${dir ? dir + ' ' : ''}nehmen${nm}`;
    case 'merge': return `Einfädeln${nm}`;
    default:
      if (md === 'uturn') return 'Wenden';
      if (!dir || md === 'straight') return `Geradeaus weiter${nm}`;
      if (md.startsWith('slight')) return `${cap(dir)} halten${nm}`;
      return `${cap(dir)} abbiegen${nm}`;
  }
}
const mIcon = s => s.ty === 'arrive' ? '🏁' : /roundabout|rotary/.test(s.ty) ? '⟳' : ({ left: '⬅', right: '➡', 'slight left': '↖', 'slight right': '↗', 'sharp left': '⬅', 'sharp right': '➡', straight: '⬆', uturn: '↩' })[s.md] || '⬆';
function speak(text, urgent) {
  NAV.lastText = text;
  if (!db.settings.voice || !('speechSynthesis' in window)) return;
  try {
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 0.95; u.volume = 1;
    const vs = (speechSynthesis.getVoices() || []).filter(x => /^de([-_]|$)/i.test(x.lang)); // deutsche Stimme bevorzugen: de-DE, lokal (funktioniert ohne Netz)
    const v = vs.find(x => /^de[-_]DE$/i.test(x.lang) && x.localService) || vs.find(x => x.localService) || vs.find(x => /^de[-_]DE$/i.test(x.lang)) || vs[0]; if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.speak(u); NAV.lastSpeech = Date.now();
  } catch (e) { /* Sprachausgabe nicht verfügbar */ }
}
function navLeg() {
  const T = S.tour; if (!T || !tourFresh()) return null;
  const nS = tourN(); let idx;
  if (T.phase === 'drive') idx = T.idx; else if (T.phase === 'end' && db.settings.roundTrip) idx = nS; else return null;
  const leg = S.route.legs[idx]; if (!leg) return null;
  const target = idx < nS ? S.stops[idx] : S.start;
  return { idx, leg, target, M: (leg.st || []).filter(s => !NAV_SKIP.includes(s.ty)), hasSteps: !!(leg.st && leg.st.length), isStop: idx < nS };
}
function navStatusText(prefix) {
  const T = S.tour; if (!T || !tourFresh()) return '';
  const nS = tourN(), live = tourEtas(), p = []; if (prefix) p.push(prefix);
  const left = S.stops.slice(0, nS).filter(s => !s.done).length;
  if (T.phase === 'end') { p.push('Alle Ziele sind erledigt.'); if (db.settings.roundTrip) p.push('Weiter zurück zum Start.'); return p.join(' '); }
  const tgt = S.stops[T.idx]; if (!tgt) return p.join(' ');
  if (T.phase === 'drive') { const e = live && live.eta[T.idx]; p.push(`Unterwegs zu Ziel ${T.idx + 1} von ${nS}: ${tgt.label}.` + (e != null ? ` Ankunft ca. ${clockSay(e)}.` : '')); p.push(`Noch ${left} ${left === 1 ? 'Ziel' : 'Ziele'}.`); }
  else { p.push(`Aufenthalt bei Ziel ${T.idx + 1}: ${tgt.label}.`); if (left > 1) p.push(`Danach noch ${left - 1} ${left - 1 === 1 ? 'Ziel' : 'Ziele'}.`); }
  if (live) {
    p.push(`Alle Ziele erledigt um ${clockSay(live.finish)}.`);
    if (db.settings.roundTrip && S.route.legs[nS]) p.push(`Zurück am Start gegen ${clockSay(live.finish + S.route.legs[nS].t / 60)}.`);
  }
  return p.join(' ');
}
function navStatus(prefix) { const t = navStatusText(prefix); if (t) { NAV.lastStatus = Date.now(); speak(t, false); } }
function navStep() { // aus Standort die nächste Abbiegung bestimmen und rechtzeitig ansagen
  const L = navLeg(); if (!L || !NAV.pos || !L.hasSteps) { NAV.view = null; return; }
  const key = L.idx + ':' + L.target.id; if (NAV.legKey !== key) { NAV.legKey = key; NAV.si = 0; NAV.said = {}; }
  const items = L.M.concat([{ ty: 'arrive', md: '', n: '', x: L.target.lon, y: L.target.lat }]), pt = it => ({ lat: it.y, lon: it.x }), p = NAV.pos;
  while (NAV.si < items.length - 1 && hav(p, pt(items[NAV.si])) < 28) NAV.si++;
  if (NAV.si < items.length - 1) { const d0 = hav(p, pt(items[NAV.si])), d1 = hav(p, pt(items[NAV.si + 1])); if (d1 < d0 && d1 < 80) NAV.si++; }
  const it = items[NAV.si], d = hav(p, pt(it)), nx = items[NAV.si + 1], arrive = it.ty === 'arrive';
  const label = L.isStop ? `Ziel ${L.idx + 1}: ${L.target.label}` : 'dem Start';
  NAV.view = { icon: mIcon(it), text: arrive ? (L.isStop ? `Ziel erreichen: ${L.target.label}` : 'Zurück zum Start') : mSay(it), street: arrive ? '' : '', d, then: nx ? (nx.ty === 'arrive' ? 'danach: Ziel' : `danach: ${low(mSay(nx))}`) : '' };
  const ths = arrive ? [150, 40] : [150], sd = NAV.said[NAV.si] = NAV.said[NAV.si] || {}; let hit = null;
  for (const th of ths) if (d <= th && !sd[th]) { sd[th] = true; hit = th; }
  if (hit == null || (NAV.acc != null && NAV.acc > 150)) return;
  if (arrive) speak(hit === 40 ? (L.isStop ? `Ziel erreicht: ${L.target.label}. Bitte Angekommen drücken.` : 'Sie sind wieder am Start.') : `In ${dSay(d)} erreichen Sie ${label}.`, true);
  else speak(`In ${dSay(d)} ${low(mSay(it))}`, true);
}
function navAuto() { // Ankunft und Weiterfahrt automatisch erkennen – kein Tippen nötig
  const T = S.tour; if (!db.settings.auto || !T || !NAV.pos || !tourFresh() || (NAV.acc != null && NAV.acc > 100)) { NAV.near = 0; NAV.far = 0; return; }
  const tgt = S.stops[T.idx]; if (!tgt || tgt.lat == null || T.phase === 'end') return;
  const d = hav(NAV.pos, tgt);
  if (T.phase === 'drive') { NAV.far = 0; NAV.near = d < 60 ? (NAV.near || 0) + 1 : 0; if (NAV.near >= 2) { NAV.near = 0; tourArrived(); } }
  else if (T.phase === 'stay') { NAV.near = 0; NAV.far = d > 150 ? (NAV.far || 0) + 1 : 0; if (NAV.far >= 3) { NAV.far = 0; tourNext('Weiter'); } }
}
function navWatch() {
  if (NAV.watch != null || !navigator.geolocation) return;
  NAV.watch = navigator.geolocation.watchPosition(p => {
    NAV.pos = { lat: p.coords.latitude, lon: p.coords.longitude }; NAV.acc = p.coords.accuracy; NAV.fix = Date.now(); NAV.err = 0; navStep(); navAuto(); navRender(); if (NAV.follow && NAV.open) map.follow(NAV.pos.lat, NAV.pos.lon); else map.draw();
  }, e => { NAV.err = e.code || 1; navRender(); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 });
}
async function navWake() { try { if ('wakeLock' in navigator && !NAV.wl) { NAV.wl = await navigator.wakeLock.request('screen'); NAV.wl.addEventListener('release', () => { NAV.wl = null; }); } } catch (e) { /* nicht erlaubt */ } }
function navBuild() {
  const b = (txt, fn, cls = '') => el('button', { class: 'btn ' + cls, type: 'button', text: txt, onclick: fn });
  const ui = { ic: el('div', { class: 'nav-ic' }), dist: el('div', { class: 'nav-dist' }), txt: el('div', { class: 'nav-txt' }), then: el('div', { class: 'nav-then' }), gps: el('div', { class: 'nav-gps' }), head: el('div', { class: 'nav-head' }), list: el('ul', { class: 'nav-list' }), fin: el('div', { class: 'nav-fin' }), btns: el('div', { class: 'nav-btns' }) };
  ui.voice = b('', () => { db.settings.voice = !db.settings.voice; if (!db.settings.voice) { try { speechSynthesis.cancel(); } catch (e) {} } else speak('Sprachausgabe an.', true); save(); navRender(); }, 'btn-dark btn-sm');
  ui.follow = b('', () => { NAV.follow = !NAV.follow; if (NAV.follow && NAV.pos) map.follow(NAV.pos.lat, NAV.pos.lon); navRender(); }, 'btn-dark btn-sm');
  ui.mapBox = el('div', { class: 'nav-map' });
  ui.auto = b('', () => { db.settings.auto = !db.settings.auto; save(); navRender(); }, 'btn-dark btn-sm');
  ui.every = b('', () => { const o = [5, 10, 3, 0]; db.settings.every = o[(o.indexOf(db.settings.every) + 1) % o.length]; save(); navRender(); }, 'btn-dark btn-sm');
  const top = el('div', { class: 'nav-top' }, b('✕ Schließen', navClose, 'btn-dark btn-sm'), ui.voice, ui.auto, ui.follow, ui.every);
  ui.root = el('div', { class: 'nav hidden', role: 'dialog', 'aria-label': 'Fahrmodus' }, top, el('div', { class: 'nav-main' }, ui.ic, ui.dist, ui.txt, ui.then), ui.mapBox, ui.gps, ui.head, ui.list, ui.fin, ui.btns);
  document.body.append(ui.root); NAV.ui = ui;
}
function navButtons() {
  const T = S.tour, ui = NAV.ui, key = T ? T.phase + ':' + T.idx : 'none'; if (NAV.btnKey === key) return; NAV.btnKey = key; ui.btns.replaceChildren();
  const b = (txt, fn, cls = '') => el('button', { class: 'btn ' + cls, type: 'button', text: txt, onclick: fn });
  if (T && tourFresh()) {
    const nS = tourN();
    if (T.phase === 'drive') ui.btns.append(b('📍 Angekommen', tourArrived, 'btn-go'));
    else if (T.phase === 'stay') { ui.btns.append(T.idx + 1 < nS ? b(`➜ Weiter zu Ziel ${T.idx + 2}`, () => tourNext('Anfahrt'), 'btn-go') : b('🏁 Letztes Ziel abschließen', () => tourNext(), 'btn-go')); ui.btns.append(b('⏭ Aufenthalt überspringen', tourSkip, 'btn-dark')); }
  }
  ui.btns.append(b('🔁 Letzte Ansage wiederholen', () => { if (NAV.lastText) speak(NAV.lastText, true); }, 'btn-dark'), b('🗣 Status ansagen', () => navStatus(''), 'btn-dark'));
}
function navRender() {
  if (!NAV.open || !NAV.ui) return; navStep(); // Anzeige sofort an aktuelle Etappe anpassen
  const ui = NAV.ui, T = S.tour, L = navLeg(), v = NAV.view;
  ui.voice.textContent = db.settings.voice ? '🔊 Sprache: an' : '🔇 Sprache: aus'; ui.follow.textContent = NAV.follow ? '🎯 Karte folgt: an' : '🎯 Karte folgt: aus'; ui.auto.textContent = db.settings.auto ? '🤖 Automatisch: an' : '🤖 Automatisch: aus'; ui.every.textContent = db.settings.every ? `⏱ Ansage alle ${db.settings.every} Min.` : '⏱ Zeitansage aus';
  const gpsAge = NAV.fix ? (Date.now() - NAV.fix) / 1000 : null;
  ui.gps.textContent = NAV.err === 1 ? '⚠ Standort nicht erlaubt – bitte in den Browser-Einstellungen freigeben.' : NAV.err ? '⚠ Kein GPS-Signal.' : gpsAge == null ? '⌛ Warte auf GPS …' : gpsAge > 20 ? `⚠ GPS-Signal seit ${Math.round(gpsAge)} s weg` : `📡 GPS aktiv (±${Math.round(NAV.acc || 0)} m)`;
  if (!T || !tourFresh()) { ui.ic.textContent = '🧭'; ui.dist.textContent = ''; ui.txt.textContent = 'Keine Tour aktiv'; ui.then.textContent = 'Berechne die Route und starte die Tour.'; }
  else if (T.phase === 'stay') { ui.ic.textContent = '📍'; ui.dist.textContent = ''; ui.txt.textContent = `Vor Ort: ${S.stops[T.idx] ? S.stops[T.idx].label : ''}`; const rem = Math.max(0, Math.round((T.t + db.settings.dwell * 60000 - Date.now()) / 1000)); ui.then.textContent = `Aufenthalt noch ${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`; }
  else if (!L) { ui.ic.textContent = '🏁'; ui.dist.textContent = ''; ui.txt.textContent = 'Alle Ziele erledigt'; ui.then.textContent = ''; }
  else if (!L.hasSteps) { ui.ic.textContent = '⚠'; ui.dist.textContent = ''; ui.txt.textContent = 'Keine Abbiegehinweise gespeichert'; ui.then.textContent = 'Route einmal mit Internet neu berechnen. Zeiten und Zielansagen laufen trotzdem.'; }
  else if (!v) { ui.ic.textContent = '⌛'; ui.dist.textContent = ''; ui.txt.textContent = 'Warte auf Standort …'; ui.then.textContent = L.target ? `Ziel: ${L.target.label}` : ''; }
  else { ui.ic.textContent = v.icon; ui.dist.textContent = dShow(v.d); ui.txt.textContent = v.text; ui.then.textContent = v.then; }
  // Übersicht: Start · Zwischenziele · Ziel · Zeiten · Endzeit
  ui.head.textContent = S.start ? `🚩 Start: ${S.start.label}` : '';
  ui.list.replaceChildren();
  if (T && tourFresh()) {
    const nS = tourN(), live = tourEtas();
    S.stops.slice(0, nS).forEach((s, i) => {
      const cur = T.phase !== 'end' && i === T.idx, name = nS > 1 && i === nS - 1 ? 'Ziel' : 'Zwischenziel';
      const when = s.done ? '✓ erledigt' : (live && live.eta[i] != null ? fmtClock(live.eta[i]) : cur && T.phase === 'stay' ? 'vor Ort' : '');
      ui.list.append(el('li', { class: s.done ? 'done' : cur ? 'cur' : '' }, el('b', { text: `${i + 1}. ${s.label}` }), el('small', { text: name }), el('time', { text: when })));
    });
    const live2 = live; let fin = '';
    if (live2) { fin = `Alle Ziele erledigt um ${fmtClock(live2.finish)}`; if (db.settings.roundTrip && S.route.legs[nS]) fin += ` · Zurück am Start ca. ${fmtClock(live2.finish + S.route.legs[nS].t / 60)}`; }
    ui.fin.textContent = fin;
  } else ui.fin.textContent = '';
  navButtons();
}
function navOpen() {
  if (!NAV.ui) navBuild();
  NAV.open = true; NAV.ui.root.classList.remove('hidden'); document.body.classList.add('nav-open'); NAV.btnKey = '';
  const wrap = $('#mapWrap'); if (wrap.parentNode !== NAV.ui.mapBox) { NAV.mapHome = { p: wrap.parentNode, n: wrap.nextSibling }; NAV.ui.mapBox.append(wrap); }
  map.resize(); if (NAV.pos && NAV.follow) map.follow(NAV.pos.lat, NAV.pos.lon); else map.fit();
  navWatch(); navWake(); speak('Fahrmodus aktiv.', true); NAV.lastStatus = Date.now();
  if (!NAV.timer) NAV.timer = setInterval(navTick, 1000);
  navRender();
}
function navClose() {
  NAV.open = false; if (NAV.ui) NAV.ui.root.classList.add('hidden'); document.body.classList.remove('nav-open');
  if (NAV.mapHome) { NAV.mapHome.p.insertBefore($('#mapWrap'), NAV.mapHome.n); NAV.mapHome = null; map.resize(); } // Karte zurück an ihren Platz
}
function navTick() {
  if (!NAV.open) return; navRender();
  const T = S.tour, ev = db.settings.every * 60000;
  if (T && T.phase !== 'end' && ev && Date.now() - NAV.lastStatus >= ev && Date.now() - NAV.lastSpeech > 12000) navStatus('');
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && NAV.open) { navWake(); navWatch(); } });

/* ---------- Eingaben ---------- */
function addStopObj(o) {
  if (S.stops.length >= CFG.maxStops) return toast('Maximal 60 Ziele pro Route.', 'warn');
  o.g = o.lat != null ? 'ok' : ''; S.stops.push(o); S.route = null; renderAll(); save();
  const ul = $('#stopList'); if (ul.lastElementChild) ul.lastElementChild.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}
function addStopFromText(t) {
  t = sStr(typeof t === 'string' ? t.replace(/^\s*(?:\d{1,3}[.)]|[-•*–])\s+/, '') : t, 240); if (!t) return false;
  let label = t, addr = t; const m = /^(.{1,160}?)\s*;\s*(.+)$/.exec(t);
  if (m && !COORD.test(t)) { label = sStr(m[1], 160); addr = sStr(m[2], 240); }
  const c = parseCoord(addr); const o = sStop({ label, addr, lat: c ? c.lat : null, lon: c ? c.lon : null }); if (!o) return false; addStopObj(o); return true;
}
function setStart(text, extra = {}) {
  let t = sStr(text, 240); if (!t) return toast('Bitte gib einen Startpunkt ein.', 'warn');
  const nm = /^(.{1,160}?)\s*;\s*(.+)$/.exec(t); let named = null;
  if (nm && parseCoord(nm[2])) { named = sStr(nm[1], 160); t = sStr(nm[2], 240); }
  const c = parseCoord(t) || (extra.lat != null ? extra : null);
  S.start = sStop({ label: extra.label || named || t, addr: t, lat: c ? c.lat : null, lon: c ? c.lon : null }); S.route = null; renderAll(); save();
}
function useLocation() {
  if (!('geolocation' in navigator)) return toast('Dein Gerät unterstützt keine Standortbestimmung.', 'err');
  toast('Ich frage deinen Standort an – bitte erlaube es im Browser.');
  navigator.geolocation.getCurrentPosition(p => {
    const lat = +p.coords.latitude.toFixed(6), lon = +p.coords.longitude.toFixed(6);
    setStart(`${lat}, ${lon}`, { label: 'Mein Standort', lat, lon });
    $('#startInput').value = ''; map.fit(); toast('Standort übernommen 📍 – das klappt auch ohne Internet.', 'ok');
  }, err => {
    toast(err.code === 1 ? 'Standort wurde nicht erlaubt. Du kannst es in den Browser-Einstellungen freigeben.' : 'Standort gerade nicht verfügbar. Gehe ins Freie oder nutze die Adresse.', 'err');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

/* ---------- Offline-Kartenspeicher (IndexedDB, nur auf diesem Gerät) ---------- */
const TDB = (() => {
  let p = null;
  const open = () => p || (p = new Promise((res, rej) => { try { const r = indexedDB.open('itw-tiles', 1); r.onupgradeneeded = () => r.result.createObjectStore('t'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }).catch(() => null));
  const tx = async (mode, fn) => { const d = await open(); if (!d) return null; return new Promise(res => { try { const t = d.transaction('t', mode), rq = fn(t.objectStore('t')); t.oncomplete = () => res(rq && 'result' in rq ? rq.result : true); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } }); };
  return { get: k => tx('readonly', s => s.get(k)), put: (k, v) => tx('readwrite', s => s.put(v, k)), keys: () => tx('readonly', s => s.getAllKeys()), clear: () => tx('readwrite', s => s.clear()) };
})();
const tileUrl = (z, x, y) => CFG.tiles[db.settings.tiles].url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
const tileKey = (z, x, y) => `${db.settings.tiles}/${z}/${x}/${y}`;
const TILE_CAP = 1500, TILE_ZOOMS = [12, 13, 14, 15, 16], OFF = { run: false, abort: false };
function tileXY(lat, lon, z) { const n = 2 ** z, r = Math.PI / 180, x = Math.floor((lon + 180) / 360 * n), y = Math.floor((1 - Math.log(Math.tan(lat * r) + 1 / Math.cos(lat * r)) / Math.PI) / 2 * n); return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))]; }
function routeTileList(zs) { // Kacheln entlang der Route (ein Streifen links und rechts) plus rund um Start und Ziele
  const set = new Map(), g = S.route && S.route.geom.length ? S.route.geom : [S.start, ...S.stops].filter(p => p && p.lat != null).map(p => [p.lon, p.lat]);
  for (const z of zs) {
    const n = 2 ** z;
    for (let i = 0; i < g.length; i++) {
      const a = g[i], b = g[i + 1] || a, m = hav({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] }), size = 40075016 * Math.cos(a[1] * Math.PI / 180) / n, steps = Math.max(1, Math.ceil(m / (size / 2)));
      for (let k = 0; k <= steps; k++) {
        const [tx, ty] = tileXY(a[1] + (b[1] - a[1]) * k / steps, a[0] + (b[0] - a[0]) * k / steps, z);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < n && y < n) set.set(`${z}/${x}/${y}`, [z, x, y]); }
      }
    }
  }
  return [...set.values()];
}
async function offInfo() {
  const el0 = $('#offMapInfo'); if (!el0) return; const keys = await TDB.keys(), n = (keys || []).filter(k => String(k).startsWith(db.settings.tiles + '/')).length;
  el0.textContent = n ? `🗺 ${n} Kartenkacheln auf diesem Gerät gespeichert (ca. ${Math.max(1, Math.round(n * 15 / 1024))} MB) – die Karte funktioniert damit auch ohne Netz.` : 'Noch keine Karte gespeichert. Mit Netz auf „Karte für die Tour offline speichern“ tippen, nachdem du die Route berechnet hast.';
}
async function offlineMapSave() {
  const btn = $('#btnOffMap');
  if (OFF.run) { OFF.abort = true; return; }
  if (!S.start && !S.stops.length) return toast('Setze zuerst Start und Ziele, am besten mit berechneter Route.', 'warn');
  if (!consent().map) return toast('Kartenbilder sind in den Einwilligungen ausgeschaltet.', 'warn');
  if (!netOk()) return toast('Zum Speichern der Karte brauchst du Internet.', 'warn');
  if (db.settings.noStore) return toast('„Nichts speichern“ ist an – so kann keine Karte abgelegt werden.', 'warn');
  let zs = TILE_ZOOMS.slice(), list = routeTileList(zs);
  while (list.length > TILE_CAP && zs.length > 2) { zs.pop(); list = routeTileList(zs); }
  if (list.length > TILE_CAP) return toast('Die Strecke ist zu lang für den Kartenspeicher. Teile die Tour auf.', 'warn');
  const have = new Set((await TDB.keys()) || []), todo = list.filter(([z, x, y]) => !have.has(tileKey(z, x, y)));
  if (!todo.length) { toast('Die Karte für diese Tour ist schon gespeichert ✓', 'ok'); return offInfo(); }
  if (!(await ask('Karte offline speichern?', `Es werden etwa ${todo.length} Kartenkacheln (ca. ${Math.max(1, Math.round(todo.length * 15 / 1024))} MB) entlang deiner Route geladen und nur auf diesem Gerät abgelegt (Zoom ${zs[0]}–${zs[zs.length - 1]}). Der Kartenanbieter sieht dabei deine IP-Adresse. Bitte nur für deine Tour nutzen.`, 'Speichern'))) return;
  OFF.run = true; OFF.abort = false; btn.textContent = '⏹ Abbrechen'; let done = 0, fail = 0, row = 0; const total = todo.length, info = $('#offMapInfo');
  const worker = async () => {
    while (todo.length && !OFF.abort) {
      const [z, x, y] = todo.shift();
      try { const r = await fetch(tileUrl(z, x, y), { referrerPolicy: 'strict-origin', credentials: 'omit', mode: 'cors' }); if (!r.ok) throw new Error('http'); await TDB.put(tileKey(z, x, y), await r.blob()); done++; row = 0; }
      catch (e) { fail++; if (++row >= 12) OFF.abort = true; }
      info.textContent = `Lade Karte … ${done + fail}/${total}`; await sleep(150);
    }
  };
  await Promise.all([worker(), worker()]);
  OFF.run = false; btn.textContent = '🗺 Karte für die Tour offline speichern'; map.resetTiles();
  toast(OFF.abort ? 'Gestoppt – ein Teil der Karte ist gespeichert.' : fail ? `Karte gespeichert, ${fail} Kacheln fehlten.` : 'Karte offline gespeichert ✓', OFF.abort || fail ? 'warn' : 'ok');
  offInfo();
}
async function offlineMapClear() { if (await ask('Gespeicherte Karte löschen?', 'Alle auf diesem Gerät abgelegten Kartenkacheln werden entfernt.', 'Löschen')) { await TDB.clear(); map.resetTiles(); offInfo(); toast('Gespeicherte Karte gelöscht.', 'ok'); } }

/* ---------- Karte (eigene, leichte Kartenengine) ---------- */
const map = (() => {
  const cv = $('#map'), ctx = cv.getContext('2d'), wrap = $('#mapWrap');
  let W = 300, H = 300, dpr = 1, view = { lat: 51.1, lon: 10.4, z: 5 }, raf = 0, dash = 0, failed = 0, loaded = 0, userMoved = false;
  const cache = new Map(); const ptrs = new Map(); let down = null, pinch = null;
  const MAXZ = 18;
  const wx = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
  const wy = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
  const lonOf = (x, z) => x / (256 * 2 ** z) * 360 - 180;
  const latOf = (y, z) => { const n = Math.PI - 2 * Math.PI * y / (256 * 2 ** z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
  const toScr = (lat, lon) => ({ x: wx(lon, view.z) - wx(view.lon, view.z) + W / 2, y: wy(lat, view.z) - wy(view.lat, view.z) + H / 2 });
  function resize() { dpr = Math.min(devicePixelRatio || 1, 2); W = wrap.clientWidth; H = wrap.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw(); }
  function tile(z, x, y) {
    const key = tileKey(z, x, y); let t = cache.get(key);
    if (t) return t;
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    const img = new Image(); t = { img, ok: false, err: false }; img.decoding = 'async'; cache.set(key, t);
    const show = (src, onFail, revoke) => { img.onload = () => { if (revoke) URL.revokeObjectURL(src); t.ok = true; loaded++; failed = 0; requestDraw(); }; img.onerror = () => { if (revoke) URL.revokeObjectURL(src); onFail(); }; img.src = src; };
    (async () => {
      const blob = await TDB.get(key); // 1. gespeicherte Kachel auf dem Gerät
      if (blob) return show(URL.createObjectURL(blob), () => { t.err = true; requestDraw(); }, true);
      if (!canMap()) { t.err = true; return; } // offline: nur Gespeichertes anzeigen, kein Fehlerzähler
      const direct = () => { img.referrerPolicy = 'strict-origin'; show(tileUrl(z, x, y), () => { t.err = true; failed++; requestDraw(); }, false); };
      try { // 2. aus dem Netz laden und dabei ablegen
        const r = await fetch(tileUrl(z, x, y), { referrerPolicy: 'strict-origin', credentials: 'omit', mode: 'cors' }); if (!r.ok) throw new Error('http');
        const b = await r.blob(); if (!db.settings.noStore) TDB.put(key, b);
        show(URL.createObjectURL(b), () => { t.err = true; failed++; requestDraw(); }, true);
      } catch (e) { direct(); }
    })();
    return t;
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
  function drawBase() {
    const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * .7);
    g.addColorStop(0, '#1d1508'); g.addColorStop(1, '#070502'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c9951c22'; ctx.lineWidth = 1; const step = 48 * (2 ** (view.z % 1)); const ox = (wx(view.lon, view.z)) % step, oy = (wy(view.lat, view.z)) % step;
    ctx.beginPath(); for (let x = -ox; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = -oy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  }
  function drawTiles() {
    const tz = Math.max(0, Math.min(MAXZ, Math.floor(view.z))), sc = 2 ** (view.z - tz), size = 256 * sc;
    const cx = wx(view.lon, tz), cy = wy(view.lat, tz), n = 2 ** tz;
    const x0 = Math.floor((cx - W / 2 / sc) / 256), x1 = Math.floor((cx + W / 2 / sc) / 256), y0 = Math.floor((cy - H / 2 / sc) / 256), y1 = Math.floor((cy + H / 2 / sc) / 256);
    let any = false;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue; const tx = ((x % n) + n) % n; const t = tile(tz, tx, y);
      if (t.ok) { ctx.drawImage(t.img, Math.round((x * 256 - cx) * sc + W / 2), Math.round((y * 256 - cy) * sc + H / 2), Math.ceil(size), Math.ceil(size)); any = true; }
    }
    ctx.fillStyle = 'rgba(14,9,2,.28)'; ctx.fillRect(0, 0, W, H);
    return any;
  }
  function marker(p, label, kind, active) {
    const r = kind === 'start' ? 15 : 13;
    if (active) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 6 + 3 * Math.sin(Date.now() / 250), 0, 7); ctx.fillStyle = '#f2c94c44'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(p.x, p.y + 3, r, 0, 7); ctx.fillStyle = '#000a'; ctx.fill();
    const g = ctx.createRadialGradient(p.x - r * .35, p.y - r * .4, 1, p.x, p.y, r);
    if (kind === 'done') { g.addColorStop(0, '#d8ffd8'); g.addColorStop(1, '#2c7a3c'); } else { g.addColorStop(0, '#fffbe0'); g.addColorStop(.45, '#f2c94c'); g.addColorStop(1, '#a8741a'); }
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#4a2f05'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(p.x - r * .2, p.y - r * .45, r * .55, r * .28, 0, 0, 7); ctx.fillStyle = '#ffffff66'; ctx.fill();
    ctx.fillStyle = kind === 'done' ? '#06240d' : '#2a1a00'; ctx.font = '700 ' + (kind === 'start' ? 13 : 12) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, p.x, p.y + 1);
  }
  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawBase();
    let tiles = false;
    if (consent().map && failed < 8) tiles = drawTiles();
    const note = $('#mapNote'), attr = $('#mapAttr');
    attr.textContent = tiles ? CFG.tiles[db.settings.tiles].attr : '';
    if (!tiles) { note.classList.remove('hidden'); note.textContent = !consent().map ? 'Kartenbilder sind aus (Datenschutz). Die Route wird schematisch gezeigt.' : db.settings.offline || !navigator.onLine ? 'Offline – schematische Ansicht. Deine Route bleibt sichtbar.' : failed >= 8 ? 'Kartenbilder werden gerade nicht geladen – schematische Ansicht.' : 'Lade Karte …'; } else note.classList.add('hidden');
    const fresh = S.route && S.route.sig === sigOf();
    if (fresh && S.route.geom.length > 1) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      S.route.geom.forEach((c, i) => { const p = toScr(c[1], c[0]); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = '#000b'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = '#f2c94c55'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -dash; ctx.stroke(); ctx.setLineDash([]);
    }
    if (S.start && S.start.lat != null) marker(toScr(S.start.lat, S.start.lon), 'S', 'start', false);
    S.stops.forEach((s, i) => { if (s.lat != null) marker(toScr(s.lat, s.lon), String(i + 1), s.done ? 'done' : 'stop', s.id === S.sel); });
    if (NAV.pos && NAV.fix && Date.now() - NAV.fix < 60000) { // eigener Live-Standort
      const q = toScr(NAV.pos.lat, NAV.pos.lon);
      ctx.beginPath(); ctx.arc(q.x, q.y, 16 + 3 * Math.sin(Date.now() / 300), 0, 7); ctx.fillStyle = '#4aa3ff44'; ctx.fill();
      ctx.beginPath(); ctx.arc(q.x, q.y, 8, 0, 7); ctx.fillStyle = '#4aa3ff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  }
  function fit() {
    const P = [S.start, ...S.stops].filter(p => p && p.lat != null); if (!P.length) return;
    userMoved = false;
    if (P.length === 1) { view = { lat: P[0].lat, lon: P[0].lon, z: 14 }; return draw(); }
    const la = P.map(p => p.lat), lo = P.map(p => p.lon); const minLa = Math.min(...la), maxLa = Math.max(...la), minLo = Math.min(...lo), maxLo = Math.max(...lo);
    const pad = 70; let z = MAXZ;
    for (; z > 2; z -= .25) { const w = Math.abs(wx(maxLo, z) - wx(minLo, z)), h = Math.abs(wy(minLa, z) - wy(maxLa, z)); if (w < W - pad * 2 && h < H - pad * 2) break; }
    view = { lat: (minLa + maxLa) / 2, lon: (minLo + maxLo) / 2, z: Math.max(2, Math.min(16, z)) }; draw();
  }
  function zoomAt(px, py, dz) {
    const nz = Math.max(2, Math.min(MAXZ, view.z + dz)); if (nz === view.z) return;
    const bx = wx(view.lon, view.z) + (px - W / 2), by = wy(view.lat, view.z) + (py - H / 2);
    const lonA = lonOf(bx, view.z), latA = latOf(by, view.z);
    const cx = wx(lonA, nz) - (px - W / 2), cy = wy(latA, nz) - (py - H / 2);
    view = { z: nz, lon: lonOf(cx, nz), lat: Math.max(-85, Math.min(85, latOf(cy, nz))) }; userMoved = true; requestDraw();
  }
  function pan(dx, dy) { const cx = wx(view.lon, view.z) - dx, cy = wy(view.lat, view.z) - dy; view.lon = lonOf(cx, view.z); view.lat = Math.max(-85, Math.min(85, latOf(cy, view.z))); userMoved = true; requestDraw(); }
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, pos(e)); down = { ...pos(e), moved: 0 }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; const p = pos(e), o = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, Math.log2(d / pinch)); pinch = d; }
    else if (ptrs.size === 1) { pan(p.x - o.x, p.y - o.y); if (down) down.moved += Math.abs(p.x - o.x) + Math.abs(p.y - o.y); }
  });
  const up = e => {
    const p = pos(e); ptrs.delete(e.pointerId); pinch = null;
    if (down && down.moved < 6 && ptrs.size === 0 && e.type === 'pointerup') { // Tippen: Marker wählen
      let hit = null; S.stops.forEach(s => { if (s.lat == null) return; const q = toScr(s.lat, s.lon); if (Math.hypot(q.x - p.x, q.y - p.y) < 18) hit = s; });
      if (hit) { S.sel = hit.id; renderStops(); draw(); const li = $(`[data-id="${hit.id}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }
    }
    if (ptrs.size === 0) down = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, -Math.sign(e.deltaY) * .5); }, { passive: false });
  cv.addEventListener('dblclick', e => { const p = pos(e); zoomAt(p.x, p.y, 1); });
  cv.addEventListener('keydown', e => { const k = e.key; if (k === '+' || k === '=') zoomAt(W / 2, H / 2, .5); else if (k === '-') zoomAt(W / 2, H / 2, -.5); else if (k === 'ArrowLeft') pan(60, 0); else if (k === 'ArrowRight') pan(-60, 0); else if (k === 'ArrowUp') pan(0, 60); else if (k === 'ArrowDown') pan(0, -60); else return; e.preventDefault(); });
  $('#zIn').onclick = () => zoomAt(W / 2, H / 2, 1); $('#zOut').onclick = () => zoomAt(W / 2, H / 2, -1); $('#zFit').onclick = fit;
  new ResizeObserver(resize).observe(wrap);
  if (!reduced) { let last = 0; const loop = t => { if (t - last > 45 && !document.hidden) { last = t; if (S.route && S.route.sig === sigOf() || S.sel) { dash = (dash + 1.2) % 22; draw(); } } requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  const follow = (lat, lon) => { view = { lat, lon, z: view.z < 15 ? 16 : view.z }; userMoved = false; requestDraw(); };
  return { draw, fit, resize, follow, resetTiles: () => { cache.clear(); failed = 0; draw(); } };
})();

/* ---------- Hintergrund: goldener Staub ---------- */
(function dust() {
  if (reduced) return; const cv = $('#dust'), c = cv.getContext('2d'); let W, H, P = [];
  const init = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; P = Array.from({ length: Math.min(70, Math.round(W / 22)) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.8 + .4, v: Math.random() * .3 + .08, a: Math.random() * 6.28 })); };
  init(); addEventListener('resize', init);
  (function loop() { c.clearRect(0, 0, W, H); if (!document.hidden) for (const p of P) { p.y -= p.v; p.x += Math.sin(p.a += .01) * .25; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fillStyle = `rgba(242,201,76,${.25 + .35 * Math.abs(Math.sin(p.a))})`; c.shadowColor = '#f2c94c'; c.shadowBlur = 8; c.fill(); } requestAnimationFrame(loop); })();
})();
/* 3D-Neigung des Logos */
(function tilt() {
  const box = $('#logo3d'); if (reduced) return;
  const mv = (x, y) => { const r = box.getBoundingClientRect(); const dx = (x - (r.left + r.width / 2)) / innerWidth, dy = (y - (r.top + r.height / 2)) / innerHeight; box.style.setProperty('--ry', (dx * 28).toFixed(1) + 'deg'); box.style.setProperty('--rx', (-dy * 22).toFixed(1) + 'deg'); };
  addEventListener('pointermove', e => mv(e.clientX, e.clientY), { passive: true });
  addEventListener('deviceorientation', e => { if (e.gamma != null) { box.style.setProperty('--ry', Math.max(-18, Math.min(18, e.gamma / 3)) + 'deg'); box.style.setProperty('--rx', Math.max(-14, Math.min(14, (e.beta - 45) / 4)) + 'deg'); } }, { passive: true });
})();
// Wichtig: --rx/--ry werden am Logo-Container gesetzt und vom Bild geerbt.

/* ---------- Datenschutz, Einwilligung, Lizenzen ---------- */
function switchRow(id, title, sub, checked) {
  const inp = el('input', { type: 'checkbox', id, checked: checked ? '' : null });
  return { inp, node: el('label', { class: 'opt', for: id }, el('span', { class: 'switch' }, inp, el('span', { class: 'sw' })), el('span', {}, el('b', { text: title }), el('small', { text: sub }))) };
}
async function consentDialog(first) {
  const c = consent();
  const a = switchRow('c-map', 'Kartenbilder laden', 'Kartenanbieter (OpenStreetMap bzw. CARTO) erfährt deine IP-Adresse und den angezeigten Kartenausschnitt.', c.map);
  const b = switchRow('c-geo', 'Adresssuche', 'Adressen und Orte werden an Nominatim (OpenStreetMap Foundation) gesendet, um Koordinaten zu finden.', c.geocode);
  const r = switchRow('c-rt', 'Routen & Fahrzeiten', 'Koordinaten deiner Stopps gehen an den öffentlichen OSRM-Server, damit echte Straßenrouten berechnet werden.', c.route);
  const body = [
    first ? 'Schön, dass du da bist! Deine Daten bleiben bei dir: Ziele, Favoriten und Listen werden nur lokal in deinem Browser gespeichert – es gibt keine Konten, keine Cookies und kein Tracking.' : 'Hier bestimmst du, mit welchen externen Diensten die App sprechen darf. Du kannst das jederzeit ändern.',
    'Für Karte, Adresssuche und Streckenberechnung nutzt die App öffentliche Dienste. Dabei sehen diese deine IP-Adresse. Das passiert nur, wenn du es hier erlaubst:',
    a.node, b.node, r.node,
    el('p', { class: 'hint', text: 'Ohne Erlaubnis funktioniert alles weiter – mit Koordinaten, schematischer Karte und geschätzten Zeiten.' })];
  const sel = el('select', { 'aria-label': 'Kartenstil' }, ...Object.entries(CFG.tiles).map(([k, v]) => el('option', { value: k, text: v.name, selected: db.settings.tiles === k ? '' : null })));
  body.push(el('label', { class: 'mini' }, 'Kartenstil: ', sel));
  const v = await dialog({ title: 'Deine Privatsphäre', body, dismiss: !first, buttons: [
    { label: 'Nur offline nutzen', value: () => ({ map: false, geocode: false, route: false }) },
    { label: 'Auswahl speichern', value: () => ({ map: a.inp.checked, geocode: b.inp.checked, route: r.inp.checked }) },
    { label: 'Alles erlauben', primary: true, value: () => ({ map: true, geocode: true, route: true }) }] });
  if (v) { db.consent = { ...v, ts: Date.now() }; db.settings.tiles = sel.value; map.resetTiles(); save(); updateConn(); renderAll(); toast('Einwilligungen gespeichert.', 'ok'); }
  else if (first) { db.consent = { map: false, geocode: false, route: false, ts: Date.now() }; save(); }
}
function privacyDialog() {
  const sec = (h, ...ps) => [el('h4', { text: h }), ...ps.map(p => typeof p === 'string' ? el('p', { text: p }) : p)];
  const noStore = switchRow('p-nostore', 'Nichts dauerhaft speichern', 'Ziele, Favoriten und Einstellungen bleiben nur im Arbeitsspeicher, bis du die Seite schließt.', db.settings.noStore);
  noStore.inp.addEventListener('change', () => { db.settings.noStore = noStore.inp.checked; if (db.settings.noStore) wipeAll(); else save(); toast(db.settings.noStore ? 'Gespeicherte Daten gelöscht – es wird nichts mehr abgelegt.' : 'Speichern wieder aktiv.'); });
  return dialog({ title: 'Datenschutz', body: [
    ...sec('Kurz gesagt', 'Diese App speichert alles ausschließlich auf deinem Gerät. IT-WORLD betreibt keinen Server, auf dem deine Ziele landen, und setzt keine Cookies, keine Analyse- und keine Werbe-Tools ein.'),
    ...sec('Verantwortlicher', CFG.owner + ' · ' + CFG.contact),
    ...sec('Was wird lokal gespeichert?', 'Startpunkt, Ziele, Notizen, Favoriten, gespeicherte Listen, Einstellungen und deine Einwilligung – im lokalen Speicher deines Browsers (Rechtsgrundlage: Art. 6 Abs. 1 lit. b/f DSGVO, technisch erforderlich für die Funktion). Du kannst alles jederzeit exportieren oder löschen.'),
    ...sec('Externe Dienste (nur mit deiner Einwilligung, Art. 6 Abs. 1 lit. a DSGVO)',
      el('ul', {}, el('li', { text: 'Kartenbilder: tile.openstreetmap.org (OpenStreetMap Foundation) oder basemaps.cartocdn.com (CARTO). Übermittelt: IP-Adresse, Kartenausschnitt, Browser-Angaben, Herkunfts-Domain.' }),
        el('li', { text: 'Adresssuche: nominatim.openstreetmap.org. Übermittelt: Suchtext (Adresse) und IP-Adresse.' }),
        el('li', { text: 'Routenberechnung: router.project-osrm.org (öffentlicher Demo-Server). Übermittelt: Koordinaten deiner Stopps und IP-Adresse.' })),
      'Diese Anbieter können außerhalb der EU sitzen. Mit „Nur offline nutzen“ findet keine Übertragung statt. Deine Einwilligung kannst du jederzeit unter „Einwilligungen ändern“ mit Wirkung für die Zukunft widerrufen.'),
    ...sec('Standort', 'Wenn du „Meinen Standort verwenden“ tippst, fragt dein Browser nach der Freigabe. Die Position wird nur im Gerät als Startpunkt genutzt und nicht an IT-WORLD gesendet.'),
    ...sec('Fotos', 'Fotos werden nur lokal im Browser geöffnet (Vorschau und GPS-Daten aus dem Bild lesen). Sie werden nie hochgeladen und nicht gespeichert.'),
    ...sec('Sicherung & Verschlüsselung', 'Sicherungsdateien kannst du mit einem Passwort verschlüsseln (AES-256-GCM, Schlüsselableitung PBKDF2). Das Passwort wird nirgends gespeichert – wenn du es vergisst, ist die Datei nicht wiederherstellbar.'),
    ...sec('Werbefrei & Updates', 'Die App enthält keine Werbung, keine Pop-ups und keine Zwischenseiten und wird auch nicht um Werbung erweitert. Sie läuft, bis du sie selbst beendest. Updates lädt die App still im Hintergrund und aktiviert sie erst beim nächsten Start – ohne Wartezeit und ohne Unterbrechung. Deine Daten bleiben bei Updates erhalten. Dafür speichert der Browser die App-Dateien lokal (Service Worker); es werden keine persönlichen Daten übertragen.'),
    ...sec('Sicherheit', 'Die Seite nutzt eine strenge Content-Security-Policy, erlaubt nur die oben genannten Verbindungen, bindet keine Fremd-Skripte ein, verarbeitet Eingaben als reinen Text und prüft importierte Dateien auf Form und Länge.'),
    ...sec('Deine Rechte', 'Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit (Export) und Widerspruch nach Art. 15–21 DSGVO sowie Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Da die Daten nur auf deinem Gerät liegen, kannst du sie dort selbst einsehen, exportieren und löschen.'),
    noStore.node ], buttons: [
    { label: 'Einwilligungen ändern', value: 'consent' }, { label: 'Alle meine Daten löschen', value: 'wipe', danger: true }, { label: 'Schließen', value: null, primary: true }] }).then(async v => {
    if (v === 'consent') consentDialog(false);
    if (v === 'wipe') wipeEverything();
  });
}
async function wipeEverything() {
  if (!(await ask('Wirklich alles löschen?', 'Ziele, Favoriten, gespeicherte Listen, Einstellungen und Einwilligung werden von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen.', 'Alles löschen', true))) return;
  wipeAll(); const keepOff = db.settings.noStore; db = sanitizeDb({}); db.settings.noStore = keepOff; S = { start: null, stops: [], route: null, sel: null };
  $('#optRound').checked = true; renderAll(); updateConn(); toast('Alle Daten wurden gelöscht.', 'ok'); setTimeout(() => consentDialog(true), 400);
}
function licenseDialog() {
  return dialog({ title: 'Lizenzen & Copyright', body: [
    el('p', { text: `© ${CFG.year} ${CFG.owner}. Alle Rechte vorbehalten. Programm, Gestaltung, Logo und Name „IT-WORLD“ sind urheberrechtlich geschützt. Vervielfältigung, Weitergabe oder Veränderung nur mit schriftlicher Zustimmung.` }),
    el('h4', { text: 'Verwendete Daten & Schriften' }),
    el('ul', {}, el('li', { text: 'Kartendaten © OpenStreetMap-Mitwirkende, lizenziert unter der Open Database License (ODbL) – openstreetmap.org/copyright.' }),
      el('li', { text: 'Kartenstil „Dark“ © CARTO (nur bei Auswahl). Für kommerzielle Nutzung gelten eigene Bedingungen des Anbieters.' }),
      el('li', { text: 'Adresssuche: Nominatim der OpenStreetMap Foundation – Nutzungsrichtlinie: höchstens 1 Anfrage pro Sekunde, keine Massenabfragen.' }),
      el('li', { text: 'Routing: OSRM (Open Source Routing Machine, BSD-2-Clause), öffentlicher Demo-Server nur für leichte Nutzung. Für den Dauerbetrieb solltest du einen eigenen oder kommerziellen Routing-Dienst einsetzen.' }),
      el('li', { text: 'Schrift „Poppins“ © Indian Type Foundry, SIL Open Font License 1.1.' })),
    el('p', { class: 'hint', text: 'Die Karten- und Routing-Anbieter haben eigene Nutzungsbedingungen. Bitte prüfe diese, bevor du die App kommerziell weitergibst.' })] });
}

/* ---------- Hilfe bei schlechtem Empfang ---------- */
async function testConnection() {
  if (!navigator.onLine) return { level: 'off', text: 'Dein Gerät meldet: kein Netz.' };
  if (!consent().geocode) return { level: 'unk', text: 'Der Test braucht die Erlaubnis für die Adresssuche (Einwilligungen). Dein Gerät meldet „online“.' };
  const t0 = performance.now();
  try { await fetchJson(`${CFG.nominatim}/status.php?format=json`, 8000); const ms = Math.round(performance.now() - t0); return ms < 1500 ? { level: 'ok', text: `Verbindung gut (${ms} ms).` } : { level: 'slow', text: `Verbindung langsam (${ms} ms).` }; }
  catch (e) { return { level: 'slow', text: 'Der Server antwortet nicht rechtzeitig – dein Empfang ist sehr schwach oder gestört.' }; }
}
function helpDialog() {
  const out = el('p', { class: 'hint', text: 'Noch nicht getestet.' });
  const offSw = switchRow('h-off', 'Offline-Modus', 'Sperrt alle Online-Dienste. Die Planung läuft dann mit Koordinaten und geschätzten Zeiten – ohne Wartezeiten.', db.settings.offline);
  offSw.inp.addEventListener('change', () => { db.settings.offline = offSw.inp.checked; save(); updateConn(); map.resetTiles(); toast(db.settings.offline ? 'Offline-Modus an.' : 'Offline-Modus aus.'); });
  return dialog({ title: 'Hilfe bei schlechtem Empfang', body: [
    'Kein Stress – du kommst auch mit wackeligem Netz ans Ziel. Probier der Reihe nach:',
    el('ol', {},
      el('li', { text: 'Kurz Flugmodus an und wieder aus, oder zwischen WLAN und Mobilfunk wechseln. Draußen oder am Fenster ist der Empfang oft besser.' }),
      el('li', { text: 'Offline-Modus einschalten (unten) – dann wartet die App nicht auf das Netz und rechnet selbst.' }),
      el('li', { text: 'Standort nutzen: Die Ortung läuft über GPS und braucht kein Internet.' }),
      el('li', { text: 'Koordinaten statt Adressen eintragen, z. B. 48,7758 9,1829 – dafür ist keine Adresssuche nötig.' }),
      el('li', { text: 'Route sichern: als Text kopieren oder als Datei speichern, damit du sie unterwegs lesen kannst.' }),
      el('li', { text: 'Offline-Karten in deiner Navi-App laden (Google Maps: Profilbild → Offline-Karten; Apple Karten, OsmAnd und Organic Maps gehen auch) und die Stopps von hier aus öffnen.' })),
    offSw.node, out], buttons: [
    { label: 'Route als Text kopieren', value: 'copy' }, { label: 'Als Datei speichern', value: 'file' },
    { label: 'Verbindung testen', keep: true, value: () => { out.textContent = 'Teste …'; testConnection().then(r => { out.textContent = r.text; out.style.setProperty('color', r.level === 'ok' ? 'var(--ok)' : r.level === 'off' ? 'var(--bad)' : 'var(--warn)'); }); } },
    { label: 'Schließen', value: null, primary: true }] }).then(v => { if (v === 'copy') copyText(); else if (v === 'file') saveTxt(); });
}
async function copyText() {
  const t = summaryText();
  try { await navigator.clipboard.writeText(t); toast('Route kopiert.', 'ok'); }
  catch (e) { const ta = el('textarea', { rows: '10', readonly: '' }); ta.value = t; await dialog({ title: 'Route als Text', body: ['Dein Browser erlaubt das Kopieren nicht automatisch. Markiere den Text und kopiere ihn von Hand:', ta] }); }
}
function download(name, blob) {
  try { const u = URL.createObjectURL(blob); const a = el('a', { href: u, download: name, rel: 'noopener' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  catch (e) { toast('Speichern als Datei klappt hier nicht. Nutze „Als Text kopieren“.', 'err'); }
}
const saveTxt = () => download('route-it-world.txt', new Blob([summaryText()], { type: 'text/plain;charset=utf-8' }));

/* ---------- Sicherung (Export/Import, optional verschlüsselt) ---------- */
const b64 = u8 => { let s = ''; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pw, salt, usage) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}
function backupObject() { return { app: 'it-world-routenplaner', v: 1, exported: new Date().toISOString(), favStops: db.favStops, favLists: db.favLists, current: { start: S.start, stops: S.stops }, settings: db.settings }; }
async function exportBackup(enc) {
  const obj = backupObject();
  if (!obj.favStops.length && !obj.favLists.length && !obj.current.stops.length) return toast('Es gibt noch nichts zu sichern.', 'warn');
  if (!enc) return download('routenplaner-sicherung.json', new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  if (!crypto.subtle) return toast('Verschlüsselung ist in diesem Browser nicht verfügbar (nur über https oder lokal).', 'err');
  const pw = await promptText('Passwort wählen', 'Mit diesem Passwort wird die Sicherung verschlüsselt. Mindestens 8 Zeichen – bitte gut merken, es kann nicht zurückgesetzt werden.', '', 'password');
  if (pw == null) return; if (pw.length < 8) return toast('Das Passwort ist zu kurz (mindestens 8 Zeichen).', 'warn');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  download('routenplaner-sicherung-verschluesselt.json', new Blob([JSON.stringify({ app: 'it-world-routenplaner', v: 1, enc: 'AES-256-GCM/PBKDF2-250k', salt: b64(salt), iv: b64(iv), data: b64(ct) })], { type: 'application/json' }));
  toast('Verschlüsselte Sicherung gespeichert 🔒', 'ok');
}
async function importBackup(file) {
  if (!file) return; if (file.size > 5e6) return toast('Die Datei ist zu groß.', 'err');
  let o; try { o = JSON.parse(await file.text()); } catch (e) { return toast('Das ist keine gültige Sicherungsdatei.', 'err'); }
  if (!o || o.app !== 'it-world-routenplaner') return toast('Diese Datei gehört nicht zu dieser App.', 'err');
  if (o.enc) {
    const pw = await promptText('Passwort eingeben', 'Diese Sicherung ist verschlüsselt.', '', 'password'); if (pw == null) return;
    try { const key = await deriveKey(pw, unb64(o.salt), ['decrypt']); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data)); o = JSON.parse(new TextDecoder().decode(pt)); }
    catch (e) { return toast('Falsches Passwort oder beschädigte Datei.', 'err'); }
  }
  const clean = sanitizeDb({ favStops: o.favStops, favLists: o.favLists, current: o.current, settings: o.settings });
  const mode = await dialog({ title: 'Sicherung laden', body: [`Gefunden: ${clean.favStops.length} Favoriten, ${clean.favLists.length} Listen, ${clean.current.stops.length} aktuelle Ziele.`, 'Wie soll geladen werden?'], buttons: [
    { label: 'Abbrechen', value: null }, { label: 'Zusammenführen', value: 'merge', primary: true }, { label: 'Alles ersetzen', value: 'replace', danger: true }] });
  if (!mode) return;
  if (mode === 'replace') { db.favStops = clean.favStops; db.favLists = clean.favLists; S.start = clean.current.start; S.stops = clean.current.stops; }
  else {
    clean.favStops.forEach(f => { if (!db.favStops.some(x => x.addr === f.addr && x.label === f.label) && db.favStops.length < CFG.maxFavStops) db.favStops.push(f); });
    clean.favLists.forEach(l => { if (db.favLists.length < CFG.maxFavLists) { let n = l.name; while (db.favLists.some(x => x.name === n)) n += ' (Import)'; db.favLists.push({ ...l, name: n.slice(0, 80) }); } });
    if (!S.stops.length && clean.current.stops.length) { S.start = S.start || clean.current.start; S.stops = clean.current.stops; }
  }
  S.route = null; renderAll(); map.fit(); save(); toast('Sicherung geladen.', 'ok');
}

/* ---------- Foto ---------- */
function exifGps(buf) {
  try {
    const v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null; let off = 2;
    while (off < v.byteLength - 4) {
      const mk = v.getUint16(off); off += 2; if ((mk & 0xFF00) !== 0xFF00) break; const len = v.getUint16(off);
      if (mk === 0xFFE1 && v.getUint32(off + 2) === 0x45786966) { const t = off + 8, le = v.getUint16(t) === 0x4949; const g16 = o => v.getUint16(o, le), g32 = o => v.getUint32(o, le);
        const ifd = t + g32(t + 4), n = g16(ifd); let gps = null;
        for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (g16(e) === 0x8825) gps = t + g32(e + 8); }
        if (!gps) return null; const m = g16(gps), tag = {};
        for (let i = 0; i < m; i++) { const e = gps + 2 + i * 12, id = g16(e);
          if (id === 1 || id === 3) tag[id] = String.fromCharCode(v.getUint8(e + 8));
          else if (id === 2 || id === 4) { const p = t + g32(e + 8); const r = [0, 1, 2].map(k => g32(p + k * 8) / (g32(p + k * 8 + 4) || 1)); tag[id] = r[0] + r[1] / 60 + r[2] / 3600; } }
        if (tag[2] == null || tag[4] == null) return null;
        const lat = sNum(tag[2] * (tag[1] === 'S' ? -1 : 1), -90, 90), lon = sNum(tag[4] * (tag[3] === 'W' ? -1 : 1), -180, 180);
        return lat != null && lon != null ? { lat: +lat.toFixed(6), lon: +lon.toFixed(6) } : null; }
      off += len;
    }
  } catch (e) { /* kein EXIF */ }
  return null;
}
async function photoDialog(file) {
  if (!file) return; if (!/^image\//.test(file.type)) return toast('Das ist kein Bild.', 'err'); if (file.size > 25e6) return toast('Das Foto ist zu groß (max. 25 MB).', 'err');
  const url = URL.createObjectURL(file); const buf = await file.arrayBuffer(); const gps = file.type === 'image/jpeg' ? exifGps(buf) : null;
  const ta = el('textarea', { rows: '6', maxlength: '5000', placeholder: 'Adressen aus dem Foto – eine pro Zeile' });
  const body = [el('img', { class: 'pv', src: url, alt: 'Dein Foto' }), el('p', { class: 'hint', text: 'Dein Foto bleibt auf deinem Gerät und wird nicht hochgeladen.' })];
  if (gps) body.push(el('div', { class: 'opt' }, el('span', { text: '📍' }), el('span', {}, el('b', { text: 'Aufnahmeort im Foto gefunden' }), el('small', { text: `${gps.lat}, ${gps.lon}` }))));
  else body.push(el('p', { class: 'hint', text: 'In diesem Foto stecken keine GPS-Daten (z. B. weil der Standort beim Fotografieren aus war oder die App sie entfernt hat).' }));
  let reading = '';
  if ('TextDetector' in window) {
    try { const det = new window.TextDetector(); const bmp = await createImageBitmap(file); const r = await det.detect(bmp); const lines = r.sort((a, b) => a.boundingBox.y - b.boundingBox.y).map(x => sStr(x.rawValue, 240)).filter(Boolean); ta.value = lines.join('\n'); reading = lines.length ? 'Text im Foto erkannt – bitte kurz prüfen und korrigieren.' : 'Im Foto wurde kein Text erkannt.'; } catch (e) { reading = ''; }
  }
  body.push(el('p', { text: reading || 'Eine Liste oder einen Zettel mit Adressen fotografiert? Tippe die Adressen unten ein (oder füge sie ein) – das Foto siehst du dabei oben. Tipp: Schick das Foto an Claude im Chat, dann liest er dir die Adressen sauber heraus.' }), ta);
  const buttons = [{ label: 'Schließen', value: null }];
  if (gps) { buttons.push({ label: 'Als Startpunkt', value: 'start' }, { label: 'Als Ziel', value: 'stop' }); }
  buttons.push({ label: 'Adressen übernehmen', primary: true, value: 'text' });
  const v = await dialog({ title: 'Per Foto planen', body, buttons });
  URL.revokeObjectURL(url);
  if (v === 'start') { setStart(`${gps.lat}, ${gps.lon}`, { label: 'Foto-Standort', lat: gps.lat, lon: gps.lon }); map.fit(); }
  else if (v === 'stop') { addStopObj(sStop({ label: 'Foto-Standort', addr: `${gps.lat}, ${gps.lon}`, lat: gps.lat, lon: gps.lon })); map.fit(); }
  else if (v === 'text') { let n = 0; ta.value.split(/\r?\n/).forEach(l => { if (n < CFG.maxStops && addStopFromText(l)) n++; }); toast(n ? `${n} Ziel(e) hinzugefügt.` : 'Keine Adressen eingetragen.', n ? 'ok' : 'warn'); }
}

/* ---------- Musik (lokale MP3, nahtlose Schleife) ---------- */
let audio = { ctx: null, src: null, on: false };
async function loadMusic(file) {
  if (!file) return;
  try {
    audio.ctx = audio.ctx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = await audio.ctx.decodeAudioData(await file.arrayBuffer());
    if (audio.src) { try { audio.src.stop(); } catch (e) {} }
    const s = audio.ctx.createBufferSource(); s.buffer = buf; s.loop = true; const g = audio.ctx.createGain(); g.gain.value = .5; s.connect(g).connect(audio.ctx.destination); s.start(); audio.src = s; audio.on = true; $('#btnMusic').textContent = '♪ an';
    toast('Musik läuft in Endlosschleife. Zum Stoppen nochmal auf ♪ tippen.', 'ok');
  } catch (e) { toast('Die Musikdatei konnte nicht gelesen werden.', 'err'); }
}
async function toggleMusic() {
  if (audio.src && audio.ctx) { if (audio.on) { await audio.ctx.suspend(); audio.on = false; $('#btnMusic').textContent = '♪'; } else { await audio.ctx.resume(); audio.on = true; $('#btnMusic').textContent = '♪ an'; } return; }
  try { audio.ctx = audio.ctx || new (window.AudioContext || window.webkitAudioContext)(); audio.ctx.resume().catch(() => {}); } catch (e) {}
  $('#musicFile').click();
}

/* ---------- Verdrahtung ---------- */
function wire() {
  $('#yr').textContent = String(CFG.year);
  $('#btnStartSet').onclick = () => { setStart($('#startInput').value); if (S.start) $('#startInput').value = ''; };
  $('#startInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnStartSet').click(); });
  $('#btnLocate').onclick = useLocation;
  $('#btnPhoto').onclick = () => $('#photoFile').click();
  $('#photoFile').onchange = e => { photoDialog(e.target.files[0]); e.target.value = ''; };
  $('#btnAdd').onclick = () => { if (addStopFromText($('#stopInput').value)) { $('#stopInput').value = ''; $('#stopInput').focus(); } };
  $('#stopInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnAdd').click(); });
  $('#btnBulk').onclick = () => { let n = 0; $('#bulkInput').value.split(/\r?\n/).forEach(l => { if (n + S.stops.length < CFG.maxStops && addStopFromText(l)) n++; }); if (n) { $('#bulkInput').value = ''; toast(`${n} Ziele hinzugefügt.`, 'ok'); } else toast('Keine Ziele erkannt.', 'warn'); };
  $('#optRound').onchange = e => { db.settings.roundTrip = e.target.checked; S.route = null; renderAll(); save(); };
  $('#optTime').onchange = e => { db.settings.time = /^\d{2}:\d{2}$/.test(e.target.value) ? e.target.value : '08:00'; renderAll(); save(); };
  $('#optDwell').onchange = e => { db.settings.dwell = sNum(e.target.value, 0, 600) ?? 5; e.target.value = db.settings.dwell; renderAll(); save(); };
  $('#btnOptimize').onclick = () => calcRoute('dist'); // Standard: nah → fern
  $('#btnOffMap').onclick = offlineMapSave; $('#btnOffClear').onclick = offlineMapClear; offInfo();
  $('#btnDist').onclick = () => calcRoute(true);       // optional: kürzeste Gesamtstrecke
  $('#btnRecalc').onclick = () => calcRoute(false);
  $('#btnClear').onclick = async () => { if (!S.stops.length || await ask('Liste leeren?', 'Alle Ziele der aktuellen Liste werden entfernt. Favoriten bleiben erhalten.', 'Leeren', true)) { S.stops = []; S.route = null; S.sel = null; $('#calcStatus').textContent = ''; renderAll(); save(); } };
  $('#btnSaveAsFav').onclick = () => { $('#tabFavLists').click(); $('#favListName').focus(); $('#favListName').scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); };
  $('#tabFavStops').onclick = () => { $('#tabFavStops').classList.add('active'); $('#tabFavLists').classList.remove('active'); $('#tabFavStops').setAttribute('aria-selected', 'true'); $('#tabFavLists').setAttribute('aria-selected', 'false'); $('#panelFavStops').classList.remove('hidden'); $('#panelFavLists').classList.add('hidden'); };
  $('#tabFavLists').onclick = () => { $('#tabFavLists').classList.add('active'); $('#tabFavStops').classList.remove('active'); $('#tabFavLists').setAttribute('aria-selected', 'true'); $('#tabFavStops').setAttribute('aria-selected', 'false'); $('#panelFavLists').classList.remove('hidden'); $('#panelFavStops').classList.add('hidden'); };
  $('#btnSaveList').onclick = saveList; $('#favListName').addEventListener('keydown', e => { if (e.key === 'Enter') saveList(); });
  $('#btnExport').onclick = () => exportBackup(false); $('#btnExportEnc').onclick = () => exportBackup(true);
  $('#btnImport').onclick = () => $('#importFile').click(); $('#importFile').onchange = e => { importBackup(e.target.files[0]); e.target.value = ''; };
  $('#btnCopy').onclick = copyText; $('#btnTxt').onclick = saveTxt; $('#btnPrint').onclick = () => { try { window.print(); } catch (e) { toast('Drucken geht hier nicht – speichere die Route als Datei.', 'warn'); } };
  ['btnHelp', 'fHelp', 'bannerHelp', 'btnConn'].forEach(id => $('#' + id).onclick = helpDialog);
  ['btnPrivacy', 'fPrivacy'].forEach(id => $('#' + id).onclick = privacyDialog);
  $('#fLicense').onclick = licenseDialog; $('#fConsent').onclick = () => consentDialog(false);
  $('#bannerClose').onclick = () => $('#banner').classList.add('hidden');
  $('#btnMusic').onclick = toggleMusic; $('#musicFile').onchange = e => { loadMusic(e.target.files[0]); e.target.value = ''; };
}


/* ---------- Installation (alle Plattformen) & stille Hintergrund-Updates ---------- */
const UA = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(UA), isWin = /Windows/.test(UA), isMac = /Macintosh/.test(UA) && !isIOS, isLinux = /Linux|X11/.test(UA) && !isAndroid;
const isFirefox = /Firefox\/|FxiOS/.test(UA), isSafari = /Safari\//.test(UA) && !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS|SamsungBrowser/.test(UA);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isWeb = /^https?:$/.test(location.protocol);
let deferredPrompt = null;
function updateInstallBtn() { $('#btnInstall').classList.toggle('hidden', standalone()); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; updateInstallBtn(); });
addEventListener('appinstalled', () => { deferredPrompt = null; toast('Installiert! Du findest die App jetzt wie jedes andere Programm. 🎉', 'ok'); updateInstallBtn(); });
async function installDialog() {
  if (standalone()) return dialog({ title: 'Schon installiert', body: ['Die App läuft bereits als eigenes Programm auf diesem Gerät. Updates kommen automatisch im Hintergrund.'] });
  const steps = [];
  const dev = isIOS ? 'iPhone / iPad' : isAndroid ? 'Android' : isWin ? 'Windows' : isMac ? 'Mac' : isLinux ? 'Linux' : 'deinem Gerät';
  let intro = `Installation auf ${dev} – in wenigen Sekunden, ohne App-Store, ohne Konto und ohne Werbung.`;
  if (!isWeb) steps.push('Zum Installieren öffne die App bitte über die https-Adresse, die du von IT-WORLD bekommen hast (nicht als lokale Datei). Du kannst sie sonst einfach weiter als Datei nutzen – das funktioniert auch offline.');
  else if (deferredPrompt) steps.push('Tippe unten auf „Jetzt installieren“ und bestätige die Anfrage deines Browsers. Fertig.');
  else if (isIOS) steps.push(isSafari ? 'Tippe in Safari unten auf das Teilen-Symbol (Quadrat mit Pfeil), wähle „Zum Home-Bildschirm“ und dann „Hinzufügen“.' : 'Öffne diese Seite in Safari. Dort: Teilen-Symbol → „Zum Home-Bildschirm“ → „Hinzufügen“.');
  else if (isMac && isSafari) steps.push('In Safari: Menü „Ablage“ → „Zum Dock hinzufügen“ (ab macOS Sonoma).');
  else if (isFirefox && !isAndroid) steps.push('Firefox kann Web-Apps am Computer nicht installieren. Öffne die Adresse in Chrome oder Edge – dort erscheint in der Adressleiste ein Installieren-Symbol. Oder lege dir die Seite als Lesezeichen an.');
  else if (isAndroid) steps.push('Tippe oben rechts auf das Menü ⋮ und wähle „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.');
  else steps.push('Klicke in der Adressleiste ganz rechts auf das Installieren-Symbol (kleiner Bildschirm mit Pfeil) oder im Browser-Menü auf „App installieren“ / „IT-WORLD Routenplaner installieren“.');
  const body = [intro, ...steps.map(x => el('div', { class: 'opt' }, el('span', { text: '✔' }), el('span', { text: x }))),
    el('p', { class: 'hint', text: 'Nach der Installation startet die App in einem eigenen Fenster, funktioniert auch ohne Internet und aktualisiert sich still im Hintergrund – ohne dich zu unterbrechen.' })];
  const buttons = [{ label: 'Schließen', value: null }];
  if (deferredPrompt) buttons.push({ label: '📲 Jetzt installieren', value: 'go', primary: true });
  const v = await dialog({ title: 'App installieren', body, buttons });
  if (v === 'go' && deferredPrompt) { try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch (e) {} deferredPrompt = null; updateInstallBtn(); }
}
function setupUpdates() {
  $('#verLine').textContent = `Version ${APP_VERSION} · Werbefrei · Updates laufen im Hintergrund`;
  updateInstallBtn(); $('#btnInstall').onclick = installDialog;
  if (standalone() && navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); }
  if (!isWeb || !('serviceWorker' in navigator)) return;
  const idle = window.requestIdleCallback || (f => setTimeout(f, 2500));
  idle(() => {   // erst wenn die App fertig angezeigt ist – nie während der Nutzung
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) $('#updNote').classList.remove('hidden'); });
      });
      const check = () => { if (navigator.onLine && !document.hidden) reg.update().catch(() => {}); };
      setInterval(check, 4 * 3600 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (check.t || 0) > 3600 * 1000) { check.t = Date.now(); check(); } });
    }).catch(() => {});
  });
}

/* ---------- Start ---------- */
loadDb();
S.start = db.current.start; S.stops = db.current.stops;
{ // gespeicherte Route wiederherstellen – nur, wenn sie noch zu Start, Zielen und „Zurück zum Start“ passt
  const r = db.current.route, nValid = S.stops.filter(s => s.lat != null).length;
  if (r && S.start && S.start.lat != null && r.rt === db.settings.roundTrip && r.legs.length === nValid + (r.rt ? 1 : 0)) {
    S.route = { geom: r.geom, legs: r.legs, dist: r.dist, dur: r.dur, src: r.src, sig: sigOf() };
    const tr = db.current.tour; // Tour dort fortsetzen, wo sie beendet wurde
    if (tr && (tr.phase === 'end' ? tr.idx === nValid : tr.idx < nValid)) {
      S.tour = { phase: tr.phase, idx: tr.idx, t: tr.t, alerted: false };
      if (tr.phase !== 'end' && S.stops[tr.idx]) S.sel = S.stops[tr.idx].id;
    }
  }
}
wire();
$('#optRound').checked = db.settings.roundTrip; $('#optTime').value = db.settings.time; $('#optDwell').value = db.settings.dwell;
updateConn(); renderAll(); map.resize(); if (S.stops.length || S.start) map.fit();
setInterval(updateConn, 15000);
setupUpdates();
if (!db.consent) consentDialog(true);
if (location.hash === '#installieren') setTimeout(installDialog, 700);
window.__itw = { calcRoute, optimizeOrder, parseCoord, exifGps, sanitizeDb, get S() { return S; }, get db() { return db; } };
})();
