'use strict';
/* ═══════════════════════════════════════════════════════════
   StageLog Terminal v2 — stagelogboek podiumtechnieken (licht)
   Alles lokaal (localStorage). AI optioneel en gratis via je
   eigen Google Gemini- of Groq-sleutel.
   ═══════════════════════════════════════════════════════════ */

const VERSION = '2.0.0';
const LS_LOGS = 'stagelog.logs';
const LS_SET = 'stagelog.settings';
const LS_HIST = 'stagelog.history';

const DEFAULT_MODELS = { gemini: 'gemini-2.5-flash', groq: 'llama-3.3-70b-versatile' };
const KEY_URLS = { gemini: 'https://aistudio.google.com/apikey', groq: 'https://console.groq.com/keys' };

// ── de indeling van een logdag ────────────────────────────
const TEXT_FIELDS = [
  { key: 'productie', title: 'Productie', icon: '◎', q: 'Aan welke productie / voorstelling / event werkte je?', hint: 'naam van de voorstelling, concert, event…', label: 'productie', remember: true },
  { key: 'locatie', title: 'Locatie', icon: '⌖', q: 'Waar was het?', hint: 'theater, zaal, festivalterrein…', label: 'locatie', remember: true },
  { key: 'uren', title: 'Werkuren', icon: '◷', q: 'Van hoe laat tot hoe laat heb je gewerkt?', hint: 'bv. 09:00–17:30 of 14:00–23:30', label: 'uren' },
];
const LIST_FIELDS = [
  { key: 'wie', title: 'Wie is er gekomen', short: 'Wie was er', icon: '◉', q: 'Wie is er vandaag gekomen?', hint: 'gezelschap, artiesten, regie, lichtontwerper, technici, crew… één per regel', label: 'wie' },
  { key: 'planning', title: 'Wat was er te doen', short: 'Planning van de dag', icon: '▤', q: 'Wat stond er vandaag op de planning?', hint: 'bv. inladen, ophangen, focussen, patchen, programmeren, repetitie, show, afbouw', label: 'planning' },
  { key: 'taken', title: 'Mijn taken', short: 'Mijn taken', icon: '⚒', q: 'Welke taken heb JIJ vandaag zelf gedaan?', hint: 'zo concreet mogelijk: bv. "8 PC\'s opgehangen op trek 4", "cues 1–20 geprogrammeerd op de Eos"', label: 'taak', required: true },
  { key: 'materiaal', title: 'Materiaal & techniek', short: 'Materiaal & techniek', icon: '◈', q: 'Met welk materiaal / welke techniek heb je gewerkt?', hint: 'lichttafel, toestellen, dimmers, DMX, kabels, gels… (leeg = overslaan)', label: 'materiaal' },
  { key: 'fouten', title: 'Wat is er fout gelopen', short: 'Wat liep er fout', icon: '⚠', q: 'Wat is er fout gelopen?', hint: 'wat ging mis, waarom, en hoe is het opgelost? (bij jou óf in de productie)', label: 'fout' },
  { key: 'geleerd', title: 'Wat heb ik geleerd', short: 'Wat heb ik geleerd', icon: '✦', q: 'Wat heb je hieruit / vandaag geleerd?', hint: 'wat kan of weet je nu dat je gisteren nog niet kon of wist?', label: 'geleerd', required: true },
  { key: 'meenemen', title: 'Meenemen naar morgen', short: 'Meenemen naar morgen', icon: '➜', q: 'Wat neem je mee naar de volgende dag?', hint: 'to-do\'s, aandachtspunten, dingen die je wil checken of anders doen', label: 'punt' },
];
const ALL_LIST_KEYS = LIST_FIELDS.map(f => f.key);
const ALL_TEXT_KEYS = TEXT_FIELDS.map(f => f.key);

const GELS = {
  congo:   { name: 'LEE 181 Congo Blue',   desc: 'diep blauw + paars (standaard)' },
  amber:   { name: 'LEE 135 Deep Golden Amber', desc: 'warm amber + oranje' },
  magenta: { name: 'LEE 128 Bright Pink',  desc: 'knalroze + violet' },
  peacock: { name: 'LEE 115 Peacock Blue', desc: 'turquoise + groen' },
  red:     { name: 'LEE 106 Primary Red',  desc: 'rood + oranje vuur' },
  uv:      { name: 'UV / Black Light',     desc: 'ultraviolet + roze' },
};

// ── opslag ────────────────────────────────────────────────
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

const strArr = a => Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [];
const str = s => typeof s === 'string' ? s.trim() : '';

function normalize(e, date) {
  const n = { date: e?.date || date };
  for (const k of ALL_TEXT_KEYS) n[k] = str(e?.[k]);
  for (const k of ALL_LIST_KEYS) n[k] = strArr(e?.[k]);
  // oude v1-logs omzetten
  if (e?.productief) n.taken = [...n.taken, ...strArr(e.productief)];
  if (e?.leermomenten) n.fouten = [...n.fouten, ...strArr(e.leermomenten)];
  n.updated = e?.updated || Date.now();
  if (e?.raw) n.raw = e.raw;
  return n;
}

let logs = {};
for (const [d, e] of Object.entries(load(LS_LOGS, {}))) logs[d] = normalize(e, d);

const storedSet = load(LS_SET, {});
let settings = {
  name: '', opleiding: 'Podiumtechnieken — Licht', stageplek: '', mentor: '', provider: 'none', theme: 'congo',
  fx: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'low' : 'max',
  ...storedSet,
  keys: { gemini: '', groq: '', ...(storedSet.keys || {}) },
  models: { ...DEFAULT_MODELS, ...(storedSet.models || {}) },
};
if (storedSet.stage && !storedSet.stageplek) settings.stageplek = storedSet.stage;
let history = load(LS_HIST, []);

function saveLogs() {
  if (!save(LS_LOGS, logs)) say('⚠ Opslaan mislukt (opslag vol of geblokkeerd). Maak een backup met Backup-Logs.', 'err');
}
const saveSettings = () => save(LS_SET, settings);

// ── datum helpers ─────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
const longDate = s => fromIso(s).toLocaleDateString('nl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const capDate = s => longDate(s).replace(/^./, c => c.toUpperCase());
const shortDay = s => fromIso(s).toLocaleDateString('nl', { weekday: 'short' });

function parseDate(input) {
  if (input === undefined || input === true || input === '') return today();
  const s = String(input).toLowerCase().trim();
  if (['vandaag', 'today', 'nu'].includes(s)) return today();
  if (['gisteren', 'yesterday'].includes(s)) return addDays(today(), -1);
  if (s === 'eergisteren') return addDays(today(), -2);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : new Date().getFullYear();
    return valid(`${y}-${pad(m[2])}-${pad(m[1])}`);
  }
  return null;
}
function valid(s) { const d = fromIso(s); return iso(d) === s ? s : null; }

function streak() {
  const d = new Date();
  if (!logs[iso(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  for (let i = 0; i < 2000; i++) {
    const w = d.getDay();
    if (w === 0 || w === 6) { if (logs[iso(d)]) n++; d.setDate(d.getDate() - 1); continue; } // weekend telt mee als je werkte, breekt niets
    if (logs[iso(d)]) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
const logCount = () => Object.keys(logs).length;
const sortedDates = () => Object.keys(logs).sort();
const prevLogDate = date => sortedDates().filter(d => d < date).pop();
function lastValue(key, date) {
  const ds = sortedDates().filter(d => d < date).reverse();
  for (const d of ds) if (logs[d][key]) return logs[d][key];
  return '';
}

// ── DOM / output ──────────────────────────────────────────
const $ = s => document.querySelector(s);
const root = document.documentElement;
const out = $('#output');
const input = $('#cmd');
const caret = $('#caret');
const promptbar = $('#promptbar');
const stage = $('#stage');

const fxOn = () => settings.fx !== 'off';
const fxMax = () => settings.fx === 'max';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function print(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'line ' + cls;
  d.innerHTML = html;
  out.appendChild(d);
  scrollDown();
  return d;
}
const say = (text, cls = '') => print(esc(text), cls);
const scrollDown = () => { out.scrollTop = out.scrollHeight; };

async function typeOut(text, cls = '') {
  const d = print('', cls);
  if (!fxOn() || text.length > 2500) { d.textContent = text; scrollDown(); return d; }
  for (let i = 0; i < text.length; i += 3) {
    d.textContent = text.slice(0, i + 3) + (i + 3 < text.length ? '█' : '');
    if (i % 30 === 0) scrollDown();
    await sleep(6);
  }
  d.textContent = text;
  scrollDown();
  return d;
}

// "decrypt"-effect: tekens ratelen tot de echte tekst verschijnt
function scramble(el, text, dur = 520) {
  if (!fxOn()) { el.textContent = text; return; }
  const chars = '!<>-_\\/[]{}=+*^?#░▒▓█01';
  const start = performance.now();
  const frame = now => {
    const p = Math.min(1, (now - start) / dur);
    const n = Math.floor(p * text.length);
    el.textContent = text.slice(0, n) + [...text.slice(n)].map(c => c === ' ' ? ' ' : chars[Math.random() * chars.length | 0]).join('');
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function spinner(label) {
  const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const d = print('', 'info');
  let i = 0;
  const t = setInterval(() => { d.textContent = `${frames[i++ % frames.length]} ${label}…`; }, 80);
  d.textContent = `${frames[0]} ${label}…`;
  return (doneText, cls = 'ok') => { clearInterval(t); if (doneText) { d.textContent = doneText; d.className = 'line ' + cls; } else d.remove(); };
}

// ── visuele effecten ──────────────────────────────────────
function applyLook() {
  root.dataset.theme = GELS[settings.theme] ? settings.theme : 'congo';
  root.dataset.fx = settings.fx;
}

function fireGo(sub) {
  if (!fxOn()) return;
  const go = $('#go');
  go.querySelector('.go-sub').textContent = sub;
  go.classList.remove('fire'); void go.offsetWidth; go.classList.add('fire');
  stage.classList.add('flare');
  setTimeout(() => stage.classList.remove('flare'), 260);
}

// haze: stofdeeltjes die door de lichtbundels zweven
(function haze() {
  const c = $('#haze');
  const ctx = c.getContext('2d');
  let w = 0, h = 0, parts = [];
  const dpr = Math.min(2, devicePixelRatio || 1);
  function resize() {
    w = c.clientWidth; h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, (w * h) / 16000));
    parts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + .3,
      vx: (Math.random() - .5) * .18, vy: -(Math.random() * .22 + .04), a: Math.random() * .5 + .15, t: Math.random() * 6.3,
    }));
  }
  addEventListener('resize', resize); resize();
  function tick() {
    requestAnimationFrame(tick);
    if (!fxMax() || document.hidden) return;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.t += .02;
      if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
      if (p.x < -5) p.x = w + 5; else if (p.x > w + 5) p.x = -5;
      const alpha = p.a * (.55 + .45 * Math.sin(p.t));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = `rgba(255,248,235,${alpha.toFixed(3)})`;
      ctx.fill();
    }
  }
  tick();
})();

// followspot volgt muis of vinger
addEventListener('pointermove', e => {
  stage.style.setProperty('--mx', e.clientX + 'px');
  stage.style.setProperty('--my', e.clientY + 'px');
}, { passive: true });

// ── prompt ────────────────────────────────────────────────
let mode = 'cmd';
let busy = false;
let askHint = '';

function segmentsHtml(isBusy = false) {
  const name = settings.name || 'stagiair';
  const st = streak();
  const time = new Date().toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' });
  return `<div class="pl">
    <span class="seg s1">⚡ ${esc(name.toLowerCase())}</span>
    <span class="seg s2">~\\licht</span>
    <span class="seg s3">◉ CUE ${logCount()}</span>
    <span class="seg ${st ? 's4' : 's5'}">${st ? '🔥 ' + st : '○ 0'}</span>
    ${isBusy ? '<span class="seg busy">⠿ bezig</span>' : ''}
    <span class="clock">${time}</span>
  </div>`;
}

function renderPrompt() {
  if (mode === 'ask') {
    promptbar.innerHTML = '';
    caret.textContent = (askHint ? askHint + ' ' : '') + '›';
    caret.className = 'ask';
  } else {
    promptbar.innerHTML = segmentsHtml(busy);
    caret.textContent = '❯';
    caret.className = '';
  }
  document.querySelectorAll('#quickbar [data-run]').forEach(b => { b.disabled = busy || mode === 'ask'; });
}
setInterval(() => { if (mode === 'cmd') renderPrompt(); }, 30000);

// ── vragen stellen ────────────────────────────────────────
class Cancel extends Error {}
class UserError extends Error {}
let pending = null;

function ask(question = '', { hint = '', secret = false, prose = true } = {}) {
  if (question) print(question, 'q');
  mode = 'ask'; askHint = hint;
  input.type = secret ? 'password' : 'text';
  input.setAttribute('autocapitalize', prose && !secret ? 'sentences' : 'off');
  input.setAttribute('autocorrect', prose && !secret ? 'on' : 'off');
  input.spellcheck = prose && !secret;
  renderPrompt();
  focusInput();
  return new Promise((resolve, reject) => { pending = { resolve, reject, secret }; }).finally(() => {
    mode = 'cmd'; askHint = '';
    input.type = 'text';
    input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off'); input.spellcheck = false;
    renderPrompt();
  });
}
const yes = async (q, def = true) => {
  const a = (await ask(q, { prose: false })).trim().toLowerCase();
  return a === '' ? def : a.startsWith('j') || a.startsWith('y');
};

async function askList(label, start = 1) {
  const items = [];
  for (let i = start; ; i++) {
    const v = (await ask('', { hint: `${label} ${i}` })).trim();
    if (!v) break;
    items.push(v);
  }
  return items;
}

function cancel() {
  if (pending) {
    const p = pending; pending = null;
    print('<span class="err">^C</span>', '');
    p.reject(new Cancel());
  } else {
    print(`${segmentsHtml()}<div class="cmdline"><span class="car">❯</span> ${esc(input.value)}<span class="err">^C</span></div>`, 'echo');
    input.value = '';
  }
}

// ── invoer ────────────────────────────────────────────────
let histIdx = -1;

function submit() {
  const v = input.value;
  input.value = '';
  if (pending) {
    const p = pending; pending = null;
    const shown = p.secret ? '•'.repeat(Math.min(v.length, 24)) : v;
    print(`<span class="arrow">${esc(askHint || '')} ›</span> ${v ? esc(shown) : '<span class="dim">(leeg)</span>'}`, 'echo-ans');
    p.resolve(v);
    return;
  }
  if (busy) return;
  echoCommand(v);
  if (v.trim()) {
    if (history[history.length - 1] !== v) history.push(v);
    history = history.slice(-200); save(LS_HIST, history);
  }
  histIdx = -1;
  run(v);
}

function echoCommand(v) {
  const parts = v.trim().split(/\s+/);
  const first = parts.shift() || '';
  const rest = parts.join(' ').replace(/(^|\s)(-\w+)/g, (m, s, p) => `${s}\u0000${p}\u0001`);
  const restHtml = esc(rest).replace(/\u0000/g, '<span class="p">').replace(/\u0001/g, '</span>');
  print(`${segmentsHtml()}<div class="cmdline"><span class="car">❯</span> <span class="c">${esc(first)}</span> ${restHtml}</div>`, 'echo');
}

input.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); submit(); }
  else if (e.key === 'Tab') { e.preventDefault(); if (mode === 'cmd') complete(); }
  else if (e.key === 'ArrowUp' && mode === 'cmd') {
    e.preventDefault();
    if (!history.length) return;
    histIdx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
    input.value = history[histIdx];
  } else if (e.key === 'ArrowDown' && mode === 'cmd') {
    e.preventDefault();
    if (histIdx < 0) return;
    histIdx++;
    if (histIdx >= history.length) { histIdx = -1; input.value = ''; } else input.value = history[histIdx];
  } else if ((e.key === 'c' || e.key === 'C') && e.ctrlKey && input.selectionStart === input.selectionEnd) {
    e.preventDefault(); cancel();
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault(); out.innerHTML = '';
  }
});

function complete() {
  const v = input.value;
  if (/\s/.test(v)) return;
  const low = v.toLowerCase();
  const hits = COMMANDS.map(c => c.name).filter(n => n.toLowerCase().startsWith(low));
  if (hits.length === 1) input.value = hits[0] + ' ';
  else if (hits.length > 1) {
    print(hits.map(h => `<span class="info">${esc(h)}</span>`).join('   '), '');
    let common = hits[0];
    for (const h of hits) while (!h.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
    if (common.length > v.length) input.value = common;
  }
}

function focusInput() {
  if (matchMedia('(pointer: coarse)').matches && mode === 'cmd') return; // geen toetsenbord-popup op iPad
  input.focus({ preventScroll: true });
}

out.addEventListener('click', e => {
  if (e.target.closest('a, button, .row, .gel')) return;
  if (String(getSelection())) return;
  input.focus({ preventScroll: true });
});

$('#quickbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.key === 'enter') { submit(); return; }
  if (b.dataset.key === 'cancel') { cancel(); return; }
  if (b.dataset.run && !busy && mode === 'cmd') { input.value = b.dataset.run; submit(); }
});

function runFromUi(cmd) { if (!busy && mode === 'cmd') { input.value = cmd; submit(); } }

// ── parser ────────────────────────────────────────────────
function parse(line) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) tokens.push({ v: m[1] ?? m[2] ?? m[3], quoted: m[3] === undefined });
  const cmd = tokens.shift()?.v || '';
  const args = { _: [], named: {} };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.quoted && /^-[a-zA-Z]/.test(t.v)) {
      const key = t.v.slice(1).toLowerCase();
      const next = tokens[i + 1];
      if (next && (next.quoted || !/^-[a-zA-Z]/.test(next.v))) { args.named[key] = next.v; i++; }
      else args.named[key] = true;
    } else args._.push(t.v);
  }
  return { cmd, args };
}

function findCommand(name) {
  const n = name.toLowerCase();
  return COMMANDS.find(c => c.name.toLowerCase() === n || c.alias.includes(n));
}

async function run(line) {
  const { cmd, args } = parse(line);
  if (!cmd) return;
  const c = findCommand(cmd);
  if (!c) {
    const core = cmd.toLowerCase().replace(/^(get|new|set|add|remove)-?/, '');
    const sugg = core ? COMMANDS.filter(x => x.name.toLowerCase().includes(core) || x.alias.some(a => a.includes(core))).slice(0, 3) : [];
    print(`<span class="err">${esc(cmd)} : De term '${esc(cmd)}' wordt niet herkend als commando.</span>`);
    print(sugg.length
      ? `<span class="dim">Bedoelde je: </span>${sugg.map(s => `<span class="info">${s.name}</span>`).join(', ')}<span class="dim"> ?</span>`
      : `<span class="dim">Typ </span><span class="info">help</span><span class="dim"> voor alle commando's.</span>`);
    return;
  }
  busy = true; renderPrompt();
  try {
    await c.fn(args);
  } catch (e) {
    if (e instanceof Cancel) say('Afgebroken.', 'dim');
    else if (e instanceof UserError) say('✖ ' + e.message, 'err');
    else { console.error(e); say('✖ Fout: ' + (e.message || e), 'err'); }
  } finally {
    busy = false; renderPrompt(); focusInput();
  }
}

// ── log weergave ──────────────────────────────────────────
function highlight(text) {
  return esc(text)
    .replace(/\b(Probleem|Fout|Oorzaak):/g, '<span class="err"><b>$1:</b></span>')
    .replace(/\b(Oplossing):/g, '<span class="warn"><b>$1:</b></span>')
    .replace(/\b(Geleerd|Leerpunt):/g, '<span class="ok"><b>$1:</b></span>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function logCardHtml(e) {
  const chips = TEXT_FIELDS.filter(f => e[f.key]).map(f => `<span class="chip">${f.icon} <b>${esc(f.title)}</b> ${esc(e[f.key])}</span>`).join('');
  const sec = f => {
    const items = e[f.key];
    if (!items.length && !f.required) return '';
    const lis = items.length ? items.map(t => `<li>${highlight(t)}</li>`).join('') : '<li class="dim">— niets ingevuld —</li>';
    return `<div class="lc-sec t-${f.key}"><div class="lc-title">${f.icon} ${esc(f.short.toUpperCase())}</div><ul>${lis}</ul></div>`;
  };
  return `<div class="logcard">
    <div class="lc-head"><span class="lc-date">📅 ${esc(capDate(e.date))}</span><span class="lc-id">${e.date}</span></div>
    ${chips ? `<div class="lc-meta">${chips}</div>` : ''}
    <div class="lc-grid">${LIST_FIELDS.map(sec).join('')}</div>
  </div>`;
}
const showLog = entry => print(logCardHtml(entry));

function carryOverHtml(forDate) {
  const pd = prevLogDate(forDate);
  if (!pd || !logs[pd].meenemen.length) return '';
  return `<div class="carry"><div class="ct">➜ MEEGENOMEN VAN ${esc(capDate(pd).toUpperCase())}</div><ul>${logs[pd].meenemen.map(t => `<li>${highlight(t)}</li>`).join('')}</ul></div>`;
}

// ── AI ────────────────────────────────────────────────────
const aiReady = () => settings.provider !== 'none' && !!settings.keys[settings.provider];

async function aiCall(system, user, { json = true, temperature = 0.4 } = {}) {
  const p = settings.provider;
  const key = settings.keys[p];
  const model = settings.models[p];
  if (!aiReady()) throw new UserError('AI is niet ingesteld. Typ Set-Config.');
  let res, data;
  try {
    if (p === 'gemini') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }),
      });
    } else {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, temperature,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    }
  } catch {
    throw new UserError('Geen verbinding met de AI. Check je internet.');
  }
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    if (res.status === 429) throw new UserError('Gratis AI-limiet even bereikt. Wacht een minuutje en probeer opnieuw.');
    if ((res.status === 400 && /api key/i.test(msg)) || res.status === 401 || res.status === 403) throw new UserError('API-sleutel ongeldig. Typ Set-Config om hem opnieuw in te stellen.');
    if (res.status === 404) throw new UserError(`Model '${model}' niet gevonden. Kies een ander model met: Set-Config -Model <naam>`);
    throw new UserError(`AI-fout (${res.status}): ${msg}`);
  }
  const text = p === 'gemini'
    ? (data.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('')
    : data.choices?.[0]?.message?.content || '';
  if (!text) throw new UserError('AI gaf een leeg antwoord. Probeer opnieuw.');
  if (!json) return text.trim();
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* val door */ } }
    throw new UserError('AI-antwoord kon niet gelezen worden. Probeer opnieuw.');
  }
}

const context = () => `De stagiair studeert ${settings.opleiding || 'podiumtechnieken, specialisatie licht'}${settings.stageplek ? ` en loopt stage bij ${settings.stageplek}` : ''}.
Het vakgebied is theater-/podiumtechniek, vooral LICHT: ophangen (rigging) aan trekken/truss, focussen, patchen, DMX, dimmers, lichttafels (bv. ETC Eos/Ion, grandMA, Chamsys), toestellen (PC, profiel/ERS, fresnel, PAR, LED, moving heads), gels, cues programmeren, repetities, shows, in- en afbouw, veiligheid (safety's, werken op hoogte).
Gebruik correcte Nederlandse/Vlaamse vaktermen uit de podiumtechniek.`;

const SYS_REVIEW = () => `Je bent een stagebegeleider podiumtechnieken (licht) die het dagelijkse STAGELOGBOEK van een stagiair nakijkt.
${context()}
Een logboek is GEEN dagboek: het gaat over de productie, wie er was, de planning, uitgevoerde taken, materiaal, wat er fout liep, wat de stagiair geleerd heeft en wat hij/zij meeneemt naar morgen. Gevoelens, sfeer, eten en pauzes horen er niet in.
Je krijgt de ruwe invoer als JSON. De stagiair schrijft ALLES ZELF; jij helpt alleen door te vragen.
Antwoord ALLEEN met JSON: {"vragen": ["..."], "dagboek": ["..."]}
- "vragen": maximaal 3 korte, concrete vervolgvragen (spreek aan met "je"), ALLEEN waar iets vaag of onvolledig is. Voorbeelden: welke toestellen/hoeveel, welke lichttafel, wat was precies de oorzaak van de fout, hoe is het opgelost, wat heb je er concreet van geleerd. Lege lijst als alles concreet genoeg is.
- "dagboek": letterlijke zinnen uit de invoer die dagboek-achtig zijn. Lege lijst als er geen zijn.`;

const SYS_POLISH = () => `Je redigeert het dagelijkse STAGELOGBOEK van een stagiair podiumtechnieken (licht).
${context()}
BELANGRIJK: de stagiair heeft alles zelf geschreven. Jij verbetert ALLEEN spelling, zinsbouw en vaktermen en maakt het beknopt en professioneel. Je verandert de inhoud niet en VERZINT NIETS. Informatie uit "extraInfo" (antwoorden op vervolgvragen) mag je verwerken in de juiste rubriek.
Regels:
- Korte actiezinnen of ik-vorm, verleden tijd. Bv. "8 PC's opgehangen op trek 4 en gefocust op de acteerplekken."
- Laat dagboek-achtige zinnen weg.
- "fouten": waar mogelijk in de vorm "Probleem: … → Oorzaak: … → Oplossing: …" (laat onbekende delen weg).
- Verplaats iets alleen naar een andere rubriek als het daar duidelijk thuishoort.
- Lege rubrieken blijven lege lijsten. Productie, locatie en uren laat je ongewijzigd.
- Geen markdown behalve backticks.
Antwoord ALLEEN met JSON met exact deze sleutels:
{"productie":"","locatie":"","uren":"","wie":[],"planning":[],"taken":[],"materiaal":[],"fouten":[],"geleerd":[],"meenemen":[]}`;

const pick = e => { const o = {}; for (const k of [...ALL_TEXT_KEYS, ...ALL_LIST_KEYS]) o[k] = e[k]; return o; };

async function aiPolish(date, raw) {
  let stop = spinner('AI leest je log mee');
  let review;
  try { review = await aiCall(SYS_REVIEW(), JSON.stringify(pick(raw))); stop(); }
  catch (e) { stop('✖ ' + e.message, 'err'); return null; }

  const diary = strArr(review.dagboek);
  if (diary.length) {
    say('⚠ Dagboek-detector — dit hoort niet echt in een logboek:', 'warn');
    diary.forEach(z => say(`   “${z}”`, 'warn'));
  }
  const extraInfo = [];
  const vragen = strArr(review.vragen).slice(0, 3);
  if (vragen.length) {
    print('<span class="section ai-sec">◆ AI VERVOLGVRAGEN</span>');
    say('Vul zelf aan zodat je log concreter wordt (leeg = overslaan):', 'dim');
    for (const q of vragen) {
      const a = (await ask(`<span class="ai">${esc(q)}</span>`, { hint: 'antwoord' })).trim();
      if (a) extraInfo.push({ vraag: q, antwoord: a });
    }
  }

  stop = spinner('AI controleert spelling en vaktermen');
  try {
    const res = await aiCall(SYS_POLISH(), JSON.stringify({ datum: date, ...pick(raw), extraInfo }));
    const r = { date };
    for (const k of ALL_TEXT_KEYS) r[k] = raw[k]; // tekstvelden blijven exact zoals jij ze schreef
    for (const k of ALL_LIST_KEYS) r[k] = res[k] === undefined ? raw[k] : strArr(res[k]);
    if (!r.taken.length && raw.taken.length) throw new UserError('AI liet je taken weg; ik hou je eigen versie.');
    stop('✔ Klaar. Zo ziet je log eruit:', 'ok');
    return r;
  } catch (e) { stop('✖ ' + e.message, 'err'); return null; }
}

// ── commando's ────────────────────────────────────────────
function stepHeader(i, total, f, extra = '') {
  const d = print(`<div class="step">
    <div class="step-top"><span class="step-n">STAP ${i}/${total}</span><span class="step-bar"><i style="--p:${i / total};--from:${(i - 1) / i}"></i></span></div>
    <div class="step-title"><span class="step-ico">${f.icon}</span> <span class="st"></span>${f.required ? '<span class="step-req">● VERPLICHT</span>' : ''}</div>
    <div class="step-hint">${esc(f.hint || '')}</div>${extra}</div>`);
  scramble(d.querySelector('.st'), f.title.toUpperCase());
}

async function cmdNewLog(a) {
  const date = parseDate(a.named.date ?? a._[0]);
  if (!date) throw new UserError('Ongeldige datum. Gebruik bv. 2026-11-03, 3-11, vandaag of gisteren.');
  print(`<span class="section">◆ NEW-LOG</span> <span class="b">${esc(capDate(date))}</span>`);

  let base = normalize({}, date);
  if (logs[date]) {
    say('Er bestaat al een log voor deze dag:', 'dim');
    showLog(logs[date]);
    const c = (await ask('[A]anvullen, [O]pnieuw beginnen of [S]toppen?', { prose: false })).trim().toLowerCase();
    if (c.startsWith('a')) base = normalize(JSON.parse(JSON.stringify(logs[date])), date);
    else if (!c.startsWith('o')) { say('Niets veranderd.', 'dim'); return; }
  }

  const carry = carryOverHtml(date);
  if (carry) print(carry);

  const steps = [...TEXT_FIELDS, ...LIST_FIELDS];
  const raw = normalize(base, date);
  for (let i = 0; i < steps.length; i++) {
    const f = steps[i];
    if (TEXT_FIELDS.includes(f)) {
      const prev = base[f.key] || (f.remember ? lastValue(f.key, date) : '');
      stepHeader(i + 1, steps.length, f);
      say(f.q + (prev ? `   (leeg = "${prev}", - = leeg laten)` : '   (leeg = overslaan)'), 'q');
      const v = (await ask('', { hint: f.label })).trim();
      raw[f.key] = v === '-' ? '' : (v || prev);
    } else {
      const have = base[f.key];
      const extra = have.length ? `<div class="prev">al ingevuld: ${have.map(t => `<span class="item">${esc(t)}</span>`).join(' · ')}</div>` : '';
      stepHeader(i + 1, steps.length, f, extra);
      say(f.q + '   (één per regel, lege regel = volgende stap)', 'q');
      let items = await askList(f.label, have.length + 1);
      while (f.required && !have.length && !items.length) {
        say(`⚠ "${f.title}" is verplicht in je logboek. Vul minstens één ding in.`, 'warn');
        items = await askList(f.label, 1);
      }
      raw[f.key] = [...have, ...items];
    }
  }

  let final = raw;
  if (aiReady()) {
    print('');
    if (await yes('🤖 AI laten doorvragen en je spelling/vaktermen laten nakijken? [J/n]')) {
      final = (await aiPolish(date, raw)) || raw;
    }
  } else {
    say('Tip: koppel gratis AI met Set-Config. Dan vraagt hij door en verbetert hij spelling en vaktermen.', 'dim');
  }

  showLog(final);
  let choice = 'j';
  if (final !== raw) choice = (await ask('Opslaan? [J]a  /  [E]igen versie (zonder AI)  /  [N]ee', { prose: false })).trim().toLowerCase() || 'j';
  else if (!(await yes('Opslaan? [J/n]'))) choice = 'n';

  if (choice.startsWith('n')) { say('Niet opgeslagen.', 'warn'); return; }
  const chosen = choice.startsWith('e') ? raw : final;
  logs[date] = { ...normalize(chosen, date), raw: pick(raw), updated: Date.now() };
  saveLogs();
  const st = streak();
  fireGo(`CUE ${logCount()} · LOG OPGESLAGEN`);
  say(`✔ Log opgeslagen voor ${longDate(date)}.${st > 1 ? `  🔥 ${st} dagen op rij!` : ''}`, 'ok glow');
}

function quickAdd(key) {
  const f = LIST_FIELDS.find(x => x.key === key);
  return async a => {
    let text = a._.join(' ').trim();
    const date = parseDate(a.named.date);
    if (!date) throw new UserError('Ongeldige datum.');
    if (!text) {
      print(`<span class="section">${f.icon} ${esc(f.title.toUpperCase())}</span> <span class="dim">${date === today() ? 'vandaag' : esc(date)}</span>`);
      say(f.q, 'q'); say(f.hint, 'dim');
      const items = await askList(f.label, (logs[date]?.[key].length || 0) + 1);
      if (!items.length) { say('Niets toegevoegd.', 'dim'); return; }
      text = items;
    }
    const e = logs[date] || normalize({}, date);
    e[key].push(...[].concat(text));
    e.updated = Date.now();
    logs[date] = e;
    saveLogs();
    say(`✔ Toegevoegd aan "${f.short}" (${date === today() ? 'vandaag' : date}). Nu ${e[key].length} item(s).`, 'ok');
  };
}

async function cmdGetLog(a) {
  const date = parseDate(a.named.date ?? a._[0]);
  if (!date) throw new UserError('Ongeldige datum.');
  if (!logs[date]) {
    say(`Geen log gevonden voor ${longDate(date)}.`, 'warn');
    if (date === today()) print('<span class="dim">Start er een met </span><span class="info">New-Log</span><span class="dim"> of voeg snel iets toe met </span><span class="info">Add-Taak</span>');
    return;
  }
  showLog(logs[date]);
}

async function cmdGetLogs() {
  const dates = sortedDates().reverse();
  if (!dates.length) { say('Nog geen logs. Begin met New-Log.', 'warn'); return; }
  const wrap = print('', '');
  const t = document.createElement('div');
  t.className = 'table';
  t.innerHTML = `<span class="th">Datum</span><span class="th wd">Dag</span><span class="th">Productie</span><span class="th num">Taken</span><span class="th num">Fouten</span>`;
  for (const d of dates) {
    const e = logs[d];
    const row = document.createElement('div');
    row.className = 'row';
    row.title = 'Klik om te openen';
    row.innerHTML = `<span class="info">${d}</span><span class="dim wd">${esc(shortDay(d))}</span><span>${esc(e.productie || e.taken[0] || '—')}${e.locatie ? ` <span class="dim">@ ${esc(e.locatie)}</span>` : ''}</span><span class="num">${e.taken.length}</span><span class="num err">${e.fouten.length}</span>`;
    row.addEventListener('click', () => runFromUi(`Get-Log ${d}`));
    t.appendChild(row);
  }
  wrap.appendChild(t);
  say(`${dates.length} log(s). Klik een rij of typ: Get-Log <datum>`, 'dim');
  scrollDown();
}

async function cmdRemoveLog(a) {
  const date = parseDate(a.named.date ?? a._[0]);
  if (!date || !logs[date]) throw new UserError('Geen log gevonden voor die datum. Gebruik: Remove-Log 2026-11-03');
  showLog(logs[date]);
  const c = (await ask('Typ <b>verwijder</b> om deze log definitief te wissen:', { prose: false })).trim().toLowerCase();
  if (c !== 'verwijder') { say('Niet verwijderd.', 'dim'); return; }
  delete logs[date]; saveLogs();
  say('✔ Log verwijderd.', 'ok');
}

function rangeFromArgs(a) {
  const dates = sortedDates();
  let from = a.named.from ? parseDate(a.named.from) : null;
  let to = a.named.to ? parseDate(a.named.to) : null;
  if (a.named.days) { const n = parseInt(a.named.days, 10) || 7; from = addDays(today(), -(n - 1)); to = today(); }
  if (a.named.week) {
    const back = a.named.week === true ? 0 : parseInt(a.named.week, 10) || 0;
    const d = new Date(); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd - 7 * back);
    from = iso(d); to = addDays(from, 6);
  }
  if ((a.named.from && !from) || (a.named.to && !to)) throw new UserError('Ongeldige datum bij -From of -To.');
  return dates.filter(d => (!from || d >= from) && (!to || d <= to));
}

async function cmdSummary(a) {
  if (!a.named.days && !a.named.week && !a.named.from) a.named.days = '7';
  const dates = rangeFromArgs(a);
  if (!dates.length) throw new UserError('Geen logs in die periode.');
  if (!aiReady()) throw new UserError('Hiervoor heb je AI nodig. Typ Set-Config.');
  const data = dates.map(d => pick(logs[d]));
  const stop = spinner(`AI vat ${dates.length} dag(en) samen`);
  let text;
  try {
    text = await aiCall(`Je maakt een samenvatting van een stagelogboek, in het Nederlands, in de ik-vorm, voor een stageverslag. ${context()}
Gebruik deze kopjes (gewone tekst, geen markdown-sterretjes of #):
OVERZICHT — 2-3 zinnen: aan welke producties en waar ik gewerkt heb.
BELANGRIJKSTE TAKEN — opsomming met "- ".
MATERIAAL & TECHNIEK — opsomming met "- " van tafels/toestellen/technieken waarmee ik werkte.
WAT IK GELEERD HEB / WAT IK NU KAN — opsomming met "- ", geformuleerd als competenties.
FOUTEN & HOE IK ERMEE OMGING — opsomming met "- " (laat weg als er geen zijn).
GROEIPUNTEN — opsomming met "- ", gebaseerd op "meenemen".
Verzin niets dat niet in de logs staat.`, JSON.stringify(data), { json: false });
    stop(`✔ Samenvatting ${dates[0]} → ${dates[dates.length - 1]}`, 'ok');
  } catch (e) { stop('✖ ' + e.message, 'err'); return; }
  await typeOut(text);
  const link = print('<a href="#">📋 kopieer samenvatting</a>').querySelector('a');
  link.addEventListener('click', async e => {
    e.preventDefault();
    try { await navigator.clipboard.writeText(text); link.textContent = '✔ gekopieerd'; } catch { link.textContent = 'kopiëren lukte niet'; }
  });
}

// ── export ────────────────────────────────────────────────
function headerInfo() {
  return [
    settings.opleiding && ['Opleiding', settings.opleiding],
    settings.stageplek && ['Stageplek', settings.stageplek],
    settings.mentor && ['Stagebegeleider', settings.mentor],
  ].filter(Boolean);
}

function buildMarkdown(dates) {
  const L = [`# Stagelogboek${settings.name ? ' — ' + settings.name : ''}`, ''];
  for (const [k, v] of headerInfo()) L.push(`**${k}:** ${v}  `);
  L.push('');
  for (const d of dates) {
    const e = logs[d];
    L.push('---', '', `## ${capDate(d)}`, '');
    for (const f of TEXT_FIELDS) if (e[f.key]) L.push(`**${f.title}:** ${e[f.key]}  `);
    L.push('');
    for (const f of LIST_FIELDS) {
      if (!e[f.key].length && !f.required) continue;
      L.push(`### ${f.short}`, '');
      (e[f.key].length ? e[f.key] : ['—']).forEach(t => L.push(`- ${t}`));
      L.push('');
    }
  }
  return L.join('\n');
}

function buildDocHtml(dates) {
  const fmt = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\b(Probleem|Oorzaak|Oplossing|Geleerd):/g, '<b>$1:</b>');
  const body = dates.map(d => {
    const e = logs[d];
    const meta = TEXT_FIELDS.filter(f => e[f.key]).map(f => `<b>${f.title}:</b> ${esc(e[f.key])}`).join(' &nbsp;·&nbsp; ');
    const secs = LIST_FIELDS.filter(f => e[f.key].length || f.required)
      .map(f => `<h3>${f.short}</h3><ul>${(e[f.key].length ? e[f.key] : ['—']).map(t => `<li>${fmt(t)}</li>`).join('')}</ul>`).join('');
    return `<div class="day"><h2>${esc(capDate(d))}</h2>${meta ? `<p class="meta">${meta}</p>` : ''}${secs}</div>`;
  }).join('');
  const info = headerInfo().map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join('<br>');
  return `<h1>Stagelogboek${settings.name ? ' — ' + esc(settings.name) : ''}</h1>
    ${info ? `<p class="sub">${info}</p>` : ''}
    <p class="sub">Periode: ${dates[0]} t/m ${dates[dates.length - 1]} · ${dates.length} dag(en)</p>${body}`;
}
const DOC_CSS = `body,#print-area{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111;line-height:1.4}
h1{font-size:20pt;margin:0 0 6pt;color:#4c1d95}.sub{color:#444;margin:0 0 6pt}.meta{color:#333;margin:2pt 0 4pt}
.day{page-break-inside:avoid;border-top:2px solid #7c3aed;padding-top:8pt;margin-top:14pt}
h2{font-size:13pt;margin:0 0 4pt;color:#111}h3{font-size:10.5pt;margin:8pt 0 2pt;color:#6d28d9;text-transform:uppercase;letter-spacing:.5pt}
ul{margin:0 0 0 18pt;padding:0}li{margin:2pt 0}code{font-family:Consolas,monospace;font-size:10pt;background:#f1f1f1}`;

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function cmdExport(a) {
  const dates = rangeFromArgs(a);
  if (!dates.length) throw new UserError('Geen logs om te exporteren (in die periode).');
  let fmt = typeof a.named.format === 'string' ? a.named.format.toLowerCase() : '';
  if (!fmt) {
    say(`${dates.length} log(s) klaar om te exporteren (${dates[0]} → ${dates[dates.length - 1]}).`, 'dim');
    const c = (await ask('Formaat? [P]DF  /  [W]ord  /  [M]arkdown', { prose: false })).trim().toLowerCase();
    fmt = c.startsWith('w') ? 'word' : c.startsWith('m') ? 'md' : c.startsWith('p') ? 'pdf' : '';
    if (!fmt) { say('Export geannuleerd.', 'dim'); return; }
  }
  const stamp = today();
  if (fmt === 'md' || fmt === 'markdown') {
    download(`stagelogboek-${stamp}.md`, buildMarkdown(dates), 'text/markdown;charset=utf-8');
    say('✔ Markdown gedownload.', 'ok');
  } else if (['word', 'doc', 'docx'].includes(fmt)) {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Stagelogboek</title><style>${DOC_CSS}</style></head><body>${buildDocHtml(dates)}</body></html>`;
    download(`stagelogboek-${stamp}.doc`, '﻿' + html, 'application/msword');
    say('✔ Word-bestand gedownload (opent in Word, Pages en Google Docs).', 'ok');
  } else if (fmt === 'pdf') {
    $('#print-area').innerHTML = `<style>${DOC_CSS}</style>${buildDocHtml(dates)}`;
    say('Printvenster opent… kies "Opslaan als PDF" (iPad: Delen → Opslaan in Bestanden).', 'info');
    await sleep(200);
    window.print();
  } else throw new UserError('Onbekend formaat. Kies pdf, word of md.');
  fireGo('EXPORT');
}

async function cmdBackup() {
  const { keys, ...safeSettings } = settings;
  const data = { app: 'StageLog', version: VERSION, exported: new Date().toISOString(), settings: safeSettings, logs };
  download(`stagelog-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  say(`✔ Backup van ${logCount()} log(s) gedownload. Bewaar dit bestand goed (bv. in iCloud/OneDrive).`, 'ok');
  say('Je API-sleutel zit er bewust NIET in.', 'dim');
}

function cmdRestore() {
  const fileEl = $('#file');
  fileEl.value = '';
  say('Kies je backup-bestand (.json)…', 'info');
  return new Promise(resolve => {
    const onChange = async () => {
      fileEl.removeEventListener('change', onChange);
      const f = fileEl.files[0];
      if (!f) { say('Geen bestand gekozen.', 'dim'); return resolve(); }
      try {
        const data = JSON.parse(await f.text());
        const incoming = data.logs || data;
        let n = 0;
        for (const [d, e] of Object.entries(incoming)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !e || typeof e !== 'object') continue;
          logs[d] = normalize(e, d); n++;
        }
        for (const k of ['name', 'opleiding', 'stageplek', 'mentor']) if (data.settings?.[k] && !settings[k]) settings[k] = data.settings[k];
        saveSettings(); saveLogs();
        say(`✔ ${n} log(s) teruggezet. Totaal nu: ${logCount()}.`, 'ok');
      } catch { say('✖ Dit bestand kon niet gelezen worden.', 'err'); }
      resolve();
    };
    fileEl.addEventListener('change', onChange);
    addEventListener('focus', () => setTimeout(() => { if (!fileEl.files.length) { fileEl.removeEventListener('change', onChange); resolve(); } }, 800), { once: true });
    fileEl.click();
  });
}

async function askKeep(label, cur, example, hint) {
  const v = (await ask(`${label}${cur ? ` <span class="dim">(nu: ${esc(cur)} — leeg = houden)</span>` : example ? `<br><span class="dim">${esc(example)}</span>` : ''}`, { hint })).trim();
  return v || cur;
}

async function cmdConfig(a) {
  if (typeof a.named.model === 'string') {
    if (settings.provider === 'none') throw new UserError('Kies eerst een AI-provider met Set-Config.');
    settings.models[settings.provider] = a.named.model; saveSettings();
    say(`✔ Model voor ${settings.provider} is nu ${a.named.model}.`, 'ok');
    return;
  }
  print('<span class="section">⚙ SET-CONFIG</span>');
  say('Deze info komt bovenaan je geëxporteerde logboek.', 'dim');
  settings.name = await askKeep('Hoe heet je?', settings.name, '', 'naam');
  settings.opleiding = await askKeep('Opleiding / richting?', settings.opleiding, '', 'opleiding');
  settings.stageplek = await askKeep('Waar loop je stage?', settings.stageplek, 'bv. "Stadsschouwburg — technische dienst" of "verhuurbedrijf X"', 'stageplek');
  settings.mentor = await askKeep('Naam van je stagebegeleider / mentor?', settings.mentor, '(leeg = overslaan)', 'mentor');
  saveSettings();

  print(`Welke gratis AI wil je gebruiken? <span class="dim">(nu: ${settings.provider})</span>
  <span class="info">[1]</span> Google Gemini  <span class="dim">— aanrader, ruime gratis limiet</span>
  <span class="info">[2]</span> Groq (Llama)    <span class="dim">— supersnel, ook gratis</span>
  <span class="info">[3]</span> Geen AI         <span class="dim">— alles werkt, alleen zonder doorvragen/spellingcheck</span>`, 'q');
  const p = (await ask('', { hint: 'keuze', prose: false })).trim().toLowerCase();
  if (p === '1' || p.startsWith('gem')) settings.provider = 'gemini';
  else if (p === '2' || p.startsWith('gr')) settings.provider = 'groq';
  else if (p === '3' || p.startsWith('geen') || p === 'none') settings.provider = 'none';
  saveSettings();

  if (settings.provider !== 'none') {
    const pr = settings.provider;
    const has = !!settings.keys[pr];
    print(`Gratis sleutel aanmaken: <a href="${KEY_URLS[pr]}" target="_blank" rel="noopener">${KEY_URLS[pr]}</a>
<span class="dim">Log in → "Create API key" → kopieer en plak hier. De sleutel blijft alleen op dit apparaat.</span>`);
    const key = (await ask(`Plak je ${pr === 'gemini' ? 'Gemini' : 'Groq'} API-sleutel${has ? ' <span class="dim">(leeg = bestaande houden)</span>' : ''}:`, { hint: 'sleutel', secret: true })).trim();
    if (key) settings.keys[pr] = key;
    saveSettings();
    if (settings.keys[pr]) await cmdTestAI();
    else say('Geen sleutel ingesteld, dus AI staat nog uit.', 'warn');
  }
  say('✔ Instellingen opgeslagen. Kies ook eens een kleurfilter met Set-Theme 🎨', 'ok');
}

async function cmdTestAI() {
  if (!aiReady()) throw new UserError('Geen AI ingesteld. Typ Set-Config.');
  const stop = spinner(`Verbinding testen met ${settings.provider} (${settings.models[settings.provider]})`);
  try {
    const r = await aiCall('Antwoord alleen met JSON: {"groet":"<korte stoere groet voor een lichttechnicus in het Nederlands, max 8 woorden>"}', 'ping', { temperature: 0.9 });
    stop(`✔ AI-uplink ONLINE — ${r.groet || 'verbonden'}`, 'ok');
  } catch (e) { stop('✖ ' + e.message, 'err'); }
}

async function cmdTheme(a) {
  const want = String(a._[0] || a.named.name || '').toLowerCase();
  const apply = k => {
    settings.theme = k; saveSettings(); applyLook(); renderPrompt();
    fireGo(GELS[k].name.toUpperCase());
    say(`✔ Gel gewisseld naar ${GELS[k].name}.`, 'ok glow');
  };
  if (want) {
    const k = Object.keys(GELS).find(x => x === want || GELS[x].name.toLowerCase().includes(want));
    if (!k) throw new UserError(`Onbekende gel. Kies uit: ${Object.keys(GELS).join(', ')}`);
    apply(k); return;
  }
  print('<span class="section">🎨 SET-THEME · kies je gel</span>');
  const wrap = print('');
  const grid = document.createElement('div');
  grid.className = 'gels';
  for (const [k, g] of Object.entries(GELS)) {
    const el = document.createElement('div');
    el.className = 'gel' + (k === settings.theme ? ' cur' : '');
    el.dataset.theme = k;
    el.innerHTML = `<div class="sw" style="background:linear-gradient(90deg,var(--a1),var(--a2),var(--a3),var(--a4))"></div><div class="gn">${esc(k)}</div><div class="gc">${esc(g.name)} — ${esc(g.desc)}</div>`;
    el.addEventListener('click', () => { if (pending) { input.value = k; submit(); } });
    grid.appendChild(el);
  }
  wrap.appendChild(grid);
  const c = (await ask('Typ de naam of tik op een gel (leeg = annuleren):', { hint: 'gel', prose: false })).trim().toLowerCase();
  if (!c) { say('Niets veranderd.', 'dim'); return; }
  const k = Object.keys(GELS).find(x => x === c || GELS[x].name.toLowerCase().includes(c));
  if (!k) throw new UserError('Onbekende gel.');
  apply(k);
}

async function cmdFx(a) {
  let v = String(a._[0] || '').toLowerCase();
  if (!v) {
    print(`Effecten: <span class="info">max</span> <span class="dim">(alles: haze, glitch, flicker)</span> · <span class="info">low</span> <span class="dim">(rustiger, spaart batterij)</span> · <span class="info">off</span> <span class="dim">(geen beweging)</span>  — nu: <b>${settings.fx}</b>`);
    v = (await ask('', { hint: 'fx', prose: false })).trim().toLowerCase();
  }
  if (!['max', 'low', 'off'].includes(v)) throw new UserError('Kies max, low of off.');
  settings.fx = v; saveSettings(); applyLook();
  say(`✔ Effecten: ${v}`, 'ok');
}

async function cmdStats() {
  const dates = sortedDates();
  const sum = k => dates.reduce((n, d) => n + logs[d][k].length, 0);
  const counts = Object.fromEntries(ALL_LIST_KEYS.map(k => [k, sum(k)]));
  const max = Math.max(1, ...Object.values(counts));
  const bar = n => { const w = 22, f = Math.round(Math.min(1, n / max) * w); return `<span class="bar">${'█'.repeat(f)}<span class="rest">${'░'.repeat(w - f)}</span></span>`; };
  const prods = {};
  for (const d of dates) if (logs[d].productie) prods[logs[d].productie] = (prods[logs[d].productie] || 0) + 1;
  const topProds = Object.entries(prods).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const st = streak();
  const lbl = s => `<span class="dim">${s.padEnd(22, ' ')}</span>`;
  print(`<span class="section">◆ GET-STATS</span>
${lbl('Stagiair')} <b>${esc(settings.name || '—')}</b>  <span class="dim">${esc(settings.opleiding || '')}</span>
${lbl('Stageplek')} ${esc(settings.stageplek || '—')}
${lbl('Logs')} <b>${dates.length}</b>${dates.length ? ` <span class="dim">(${dates[0]} → ${dates[dates.length - 1]})</span>` : ''}
${lbl('Streak')} <b>${st ? '🔥 ' + st : '0'}</b> <span class="dim">dagen op rij</span>
${LIST_FIELDS.map(f => `${lbl(f.icon + ' ' + f.short)} ${bar(counts[f.key])} <b>${counts[f.key]}</b>`).join('\n')}
${lbl('Producties')} ${topProds.length ? topProds.map(([p, n]) => `${esc(p)} <span class="dim">(${n}d)</span>`).join(' · ') : '—'}
${lbl('AI')} ${aiReady() ? `<span class="ok">● ${settings.provider}</span> <span class="dim">${esc(settings.models[settings.provider])}</span>` : '<span class="warn">○ uit</span> <span class="dim">(Set-Config)</span>'}
${lbl('Gel / effecten')} ${esc(GELS[settings.theme]?.name || '')} · fx ${settings.fx}
${lbl('Versie')} v${VERSION}`);
}

function cmdHelp() {
  const groups = {};
  for (const c of COMMANDS) (groups[c.group] = groups[c.group] || []).push(c);
  const rows = Object.entries(groups).map(([g, cs]) => `<div class="help-h">── ${esc(g.toUpperCase())}</div>` + cs.map(c =>
    `<span class="cmd">${c.name}</span><span class="desc">${esc(c.desc)}${c.alias.length ? ` <span class="al">[${c.alias.join(', ')}]</span>` : ''}${c.usage ? `<br><span class="dim">  ${esc(c.usage)}</span>` : ''}</span>`).join('')).join('');
  print('<span class="section">◆ GET-HELP</span>');
  print(`<div class="help-grid">${rows}</div>`);
  say('Tab = aanvullen · ↑↓ = vorige commando\'s · Ctrl+C = afbreken · Ctrl+L = scherm leeg', 'dim');
  say('Datums: vandaag, gisteren, 3-11, 2026-11-03', 'dim');
}

const COMMANDS = [
  { group: 'Loggen', name: 'New-Log', alias: ['nl', 'new', 'log'], desc: 'Je volledige log van vandaag invullen, stap voor stap', usage: 'New-Log  |  New-Log -Date gisteren', fn: cmdNewLog },
  { group: 'Loggen', name: 'Add-Taak', alias: ['taak', 'task', 'add-task'], desc: 'Snel een taak toevoegen (ook tussendoor)', usage: 'Add-Taak "Moving heads gepatcht op universe 2"', fn: quickAdd('taken') },
  { group: 'Loggen', name: 'Add-Fout', alias: ['fout'], desc: 'Snel iets toevoegen dat fout liep', fn: quickAdd('fouten') },
  { group: 'Loggen', name: 'Add-Geleerd', alias: ['geleerd', 'les', 'add-lesson'], desc: 'Snel iets toevoegen dat je geleerd hebt', fn: quickAdd('geleerd') },
  { group: 'Loggen', name: 'Add-Morgen', alias: ['morgen', 'todo'], desc: 'Iets noteren om mee te nemen naar morgen', fn: quickAdd('meenemen') },
  { group: 'Loggen', name: 'Add-Wie', alias: ['wie'], desc: 'Iemand toevoegen die er vandaag was', fn: quickAdd('wie') },
  { group: 'Bekijken', name: 'Get-Log', alias: ['gl', 'show', 'cat'], desc: 'Bekijk de log van een dag', usage: 'Get-Log  |  Get-Log gisteren  |  Get-Log 3-11', fn: cmdGetLog },
  { group: 'Bekijken', name: 'Get-Logs', alias: ['ls', 'dir', 'list'], desc: 'Overzicht van al je logs', fn: cmdGetLogs },
  { group: 'Bekijken', name: 'Get-Stats', alias: ['stats', 'whoami'], desc: 'Statistieken, streak en producties', fn: cmdStats },
  { group: 'Verslag', name: 'Get-Summary', alias: ['sum', 'samenvatting'], desc: 'AI-samenvatting van een periode (voor je verslag)', usage: 'Get-Summary  |  -Week  |  -Days 30', fn: cmdSummary },
  { group: 'Verslag', name: 'Export-Verslag', alias: ['export'], desc: 'Exporteer naar PDF, Word of Markdown', usage: 'Export-Verslag -Format pdf  |  -Week 1  |  -From 1-11 -To 7-11', fn: cmdExport },
  { group: 'Beheer', name: 'Remove-Log', alias: ['rm', 'del'], desc: 'Verwijder een log', usage: 'Remove-Log 2026-11-03', fn: cmdRemoveLog },
  { group: 'Beheer', name: 'Backup-Logs', alias: ['backup'], desc: 'Download een backup van alles (.json)', fn: cmdBackup },
  { group: 'Beheer', name: 'Restore-Logs', alias: ['restore', 'import'], desc: 'Zet een backup terug (ook pc ↔ iPad)', fn: cmdRestore },
  { group: 'Instellingen', name: 'Set-Config', alias: ['setup', 'config'], desc: 'Naam, opleiding, stageplek, mentor en gratis AI', usage: 'Set-Config  |  Set-Config -Model gemini-2.5-flash', fn: cmdConfig },
  { group: 'Instellingen', name: 'Set-Theme', alias: ['theme', 'gel', 'kleur'], desc: 'Kies een kleurfilter (gel) voor de hele app', usage: 'Set-Theme  |  Set-Theme amber', fn: cmdTheme },
  { group: 'Instellingen', name: 'Set-Fx', alias: ['fx', 'effects'], desc: 'Effecten: max / low / off', fn: cmdFx },
  { group: 'Instellingen', name: 'Test-AI', alias: ['ping'], desc: 'Test de AI-verbinding', fn: cmdTestAI },
  { group: 'Instellingen', name: 'Clear-Host', alias: ['cls', 'clear'], desc: 'Scherm leegmaken', fn: async () => { out.innerHTML = ''; } },
  { group: 'Instellingen', name: 'Get-Help', alias: ['help', '?', 'man'], desc: 'Deze lijst', fn: async () => cmdHelp() },
];

// ── opstarten ─────────────────────────────────────────────
const FONT = {
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  G: [' ██████╗ ', '██╔════╝ ', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  ' ': ['  ', '  ', '  ', '  ', '  ', '  '],
};
const bannerText = word => [0, 1, 2, 3, 4, 5].map(r => [...word].map(ch => FONT[ch][r]).join('')).join('\n');

async function boot() {
  applyLook();
  renderPrompt();
  const fast = !fxOn() || sessionStorage.getItem('booted');

  const wrap = print('<div class="banner-wrap"><pre class="banner"></pre></div>');
  const pre = wrap.querySelector('.banner');
  const text = bannerText('STAGE LOG');
  pre.dataset.text = text;
  pre.textContent = text;
  const tag = print('<span class="tagline"></span>').querySelector('.tagline');
  scramble(tag, `PODIUMTECHNIEKEN · LICHT · LOGBOEK v${VERSION}`, 900);

  const steps = [
    ['ok', `Initializing StageLog kernel v${VERSION}`],
    ['ok', 'Patching DMX universe 1 ............. 512 ch'],
    ['ok', `Loading cue stack ................... ${logCount()} cues`],
    ['ok', 'Warming up lamps .................... 100%'],
    ['ok', 'Haze machine ........................ ON'],
    aiReady() ? ['ok', `AI uplink: ${settings.provider} → ${settings.models[settings.provider]}`] : ['wn', 'AI uplink: niet geconfigureerd (Set-Config)'],
  ];
  const truss = [...document.querySelectorAll('.truss i')];
  for (let i = 0; i < steps.length; i++) {
    const [t, msg] = steps[i];
    print(`<span class="tag ${t}">[${t === 'ok' ? ' OK ' : 'WARN'}]</span> <span class="dim">${esc(msg)}</span>`, 'boot');
    if (!fast) await sleep(120 + Math.random() * 130);
    if (i === 3) stage.classList.add('on'); // lampen aan!
  }
  stage.classList.add('on');
  truss.forEach(x => x.style.opacity = '');
  try { sessionStorage.setItem('booted', '1'); } catch { /* ok */ }
  print('');

  const name = settings.name ? `, ${esc(settings.name)}` : '';
  print(`Welkom terug${name}. <span class="dim">Vandaag is</span> <b>${esc(longDate(today()))}</b>.`);
  if (logs[today()]) print(`<span class="ok">✔ Je log van vandaag staat er al.</span> <span class="dim">Bekijk met</span> <span class="info">Get-Log</span><span class="dim">, aanvullen met</span> <span class="info">New-Log</span>`);
  else {
    print(`<span class="warn">● Nog geen log voor vandaag.</span> <span class="dim">Typ</span> <span class="info">New-Log</span> <span class="dim">of tik op ▶ New-Log. Alle commando's:</span> <span class="info">help</span>`);
    const carry = carryOverHtml(today());
    if (carry) print(carry);
  }

  if (!settings.name) {
    print('');
    say('Eerste keer hier? Even instellen…', 'info');
    await sleep(fast ? 0 : 400);
    input.value = 'Set-Config';
    submit();
  }
}

document.addEventListener('keydown', e => {
  if (document.activeElement !== input && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) input.focus();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().then(focusInput);
