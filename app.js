'use strict';
/* ═══════════════════════════════════════════════════════════
   StageLog Terminal v2 — stagelogboek podiumtechnieken (licht)
   Alles lokaal (localStorage). AI optioneel en gratis via je
   eigen Google Gemini- of Groq-sleutel.
   ═══════════════════════════════════════════════════════════ */

const VERSION = '4.0.0';
const LS_LOGS = 'stagelog.logs';
const LS_SET = 'stagelog.settings';
const LS_HIST = 'stagelog.history';
const LS_DRAFT = 'stagelog.draft';

const DEFAULT_MODELS = { gemini: 'gemini-flash-latest', groq: 'llama-3.3-70b-versatile' };
// als een model ooit verdwijnt, probeert de app automatisch het volgende
const MODEL_FALLBACKS = {
  gemini: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-lite-latest'],
  groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
};
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
  name: '', opleiding: 'Podiumtechnieken — Licht', stageplek: '', mentor: '', provider: 'none', theme: 'congo', lastBackup: 0,
  fx: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'low' : 'max',
  ...storedSet,
  keys: { gemini: '', groq: '', ...(storedSet.keys || {}) },
  models: { ...DEFAULT_MODELS, ...(storedSet.models || {}) },
};
if (storedSet.stage && !storedSet.stageplek) settings.stageplek = storedSet.stage;
let history = load(LS_HIST, []);

function saveLogs() {
  if (!save(LS_LOGS, logs)) say('⚠ Opslaan mislukt (opslag vol of geblokkeerd). Maak een backup met backup logs.', 'err');
}
const saveSettings = () => save(LS_SET, settings);
const clearDraft = () => { try { localStorage.removeItem(LS_DRAFT); } catch { /* ok */ } };

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
  if (s === 'morgen') return addDays(today(), 1);
  // weekdag: "vrijdag" = de laatste vrijdag (vandaag inbegrepen)
  const WD = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const wd = WD.findIndex(w => s.replace(/^(vorige|afgelopen)\s+/, '') === w || s === w.slice(0, 2) || s === w.slice(0, 3));
  if (wd >= 0) { let d = today(); while (fromIso(d).getDay() !== wd) d = addDays(d, -1); if (/^(vorige|afgelopen)/.test(s) && d === today()) d = addDays(d, -7); return d; }
  // "3 november", "3 nov", "3 nov 2026"
  const MN = ['jan', 'feb', 'maa', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  let w = s.match(/^(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?$/);
  if (w) {
    const mi = MN.findIndex(x => w[2].startsWith(x) || (x === 'maa' && w[2].startsWith('mrt')) || (x === 'okt' && w[2].startsWith('oct')));
    if (mi >= 0) return valid(`${w[3] || new Date().getFullYear()}-${pad(mi + 1)}-${pad(w[1])}`);
  }
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

// werkuren: "09:00-17:30", "9u-17u30", "9.00 tot 17.30", "14:00–01:00" (over middernacht)
function parseHours(s) {
  if (!s) return null;
  const t = String(s).toLowerCase().replace(/(\d)\s*u\s*(\d{2})/g, '$1:$2').replace(/(\d)\s*u\b/g, '$1').replace(/(\d)h(\d{2})/g, '$1:$2');
  const m = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|—|tot|>|t\/m)\s*(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m) return null;
  const a = +m[1] * 60 + (+m[2] || 0);
  let b = +m[3] * 60 + (+m[4] || 0);
  if (+m[1] > 24 || +m[3] > 24 || (+m[2] || 0) > 59 || (+m[4] || 0) > 59) return null;
  if (b <= a) b += 1440;
  const pauze = t.match(/pauze\s*(\d{1,3})/);
  return b - a - (pauze ? +pauze[1] : 0);
}
const fmtMins = m => m == null ? '' : `${Math.floor(m / 60)}u${m % 60 ? pad(m % 60) : ''}`;

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
  // alle spots draaien naar het midden van het scherm
  const W = innerWidth, H = innerHeight;
  document.querySelectorAll('.beam').forEach(b => {
    const x = b.getBoundingClientRect().left + b.offsetWidth / 2;
    b.style.setProperty('--aim', `${(-Math.atan2(W / 2 - x, H * .55) * 180 / Math.PI).toFixed(1)}deg`);
  });
  stage.classList.add('flare', 'focus');
  setTimeout(() => stage.classList.remove('flare'), 260);
  setTimeout(() => stage.classList.remove('focus'), 1300);
  if (fxMax()) window.burst?.(W / 2, H * .45);
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
  let sparks = [];
  window.burst = (x, y) => {
    const cs = getComputedStyle(root);
    const cols = ['--a1', '--a2', '--a4'].map(v => cs.getPropertyValue(v).trim()).concat('#fff4d6');
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * 6.283, v = Math.random() * 7 + 2;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, r: Math.random() * 2 + .8, c: cols[i % cols.length] });
    }
  };
  function tick() {
    requestAnimationFrame(tick);
    if (!fxMax() || document.hidden) return;
    ctx.clearRect(0, 0, w, h);
    if (sparks.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sparks) {
        s.x += s.vx; s.y += s.vy; s.vy += .12; s.vx *= .985; s.life -= .014;
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fillStyle = s.c; ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      sparks = sparks.filter(s => s.life > 0 && s.y < h + 20);
    }
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
  // tijdens een vraag: alleen ⏎ / ^C (en "overslaan") tonen, zodat ze op de iPad altijd in beeld staan
  document.querySelectorAll('#quickbar [data-run]').forEach(b => { b.hidden = mode === 'ask'; b.disabled = busy; });
  const skip = document.querySelector('#quickbar .qb-skip');
  if (skip) skip.hidden = mode !== 'ask';
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
    if (!v || v === '-') break;
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
  const tokens = tokenize(v);
  const hit = matchCommand(tokens);
  const n = hit ? tokens.length - hit.rest.length : Math.min(1, tokens.length);
  const words = v.trim().split(/\s+/);
  const head = words.slice(0, n).join(' ');
  const rest = words.slice(n).map(w => FLAG_WORDS[w.toLowerCase().replace(/^-/, '')] && hit && !hit.c.text ? `<span class="p">${esc(w)}</span>` : esc(w)).join(' ');
  print(`${segmentsHtml()}<div class="cmdline"><span class="car">❯</span> <span class="${hit ? 'c' : 'err'}">${esc(head)}</span> ${rest}</div>`, 'echo');
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
  const v = input.value.replace(/\s+/g, ' ').trimStart().toLowerCase();
  if (!v) return;
  const hits = COMMANDS.map(c => c.name).filter(n => n.startsWith(v) || norm(n).startsWith(norm(v)));
  if (hits.length === 1) input.value = hits[0] + ' ';
  else if (hits.length > 1) {
    print(hits.map(h => `<span class="info">${esc(h)}</span>`).join('   '), '');
    let common = hits[0];
    for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
    if (common.length > v.length) input.value = common;
  }
}

function focusInput() {
  if (matchMedia('(pointer: coarse)').matches && mode === 'cmd') return; // geen toetsenbord-popup op iPad
  input.focus({ preventScroll: true });
}

out.addEventListener('click', e => {
  if (e.target.closest('a, button, .row, .gel, .row-link, .help-card, .datepick')) return;
  if (String(getSelection())) return;
  input.focus({ preventScroll: true });
});

$('#quickbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.key === 'enter') { submit(); return; }
  if (b.dataset.key === 'cancel') { cancel(); return; }
  if (b.dataset.key === 'skip') { input.value = '-'; submit(); return; }
  if (b.dataset.run && !busy && mode === 'cmd') { input.value = b.dataset.run; submit(); }
});

function runFromUi(cmd) { if (!busy && mode === 'cmd') { input.value = cmd; submit(); } }

// ── parser ────────────────────────────────────────────────
// Commando's mogen met spaties, streepjes of aan elkaar: "new log", "New-Log", "newlog".
const norm = x => String(x).toLowerCase().replace(/[-_\s]/g, '');
const FLAG_WORDS = {
  date: 'date', datum: 'date', format: 'format', formaat: 'format', week: 'week', days: 'days', dagen: 'days', dag: 'days',
  from: 'from', van: 'from', vanaf: 'from', to: 'to', tot: 'to', all: 'all', alles: 'all', model: 'model',
  maand: 'month', month: 'month', vorige: 'prev', previous: 'prev', last: 'prev', nosummary: 'nosummary',
};
const VALUE_FLAGS = new Set(['date', 'format', 'from', 'to', 'model']);
const FORMAT_WORDS = { word: 'word', docx: 'word', doc: 'word', pdf: 'pdf', md: 'md', markdown: 'md' };

function tokenize(line) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) tokens.push({ v: m[1] ?? m[2] ?? m[3], quoted: m[3] === undefined });
  return tokens;
}

function matchCommand(tokens) {
  for (let k = Math.min(3, tokens.length); k >= 1; k--) {
    if (tokens.slice(0, k).some(t => t.quoted)) continue;
    const key = norm(tokens.slice(0, k).map(t => t.v).join(''));
    const c = COMMANDS.find(c => norm(c.name) === key || c.alias.some(a => norm(a) === key));
    if (c) return { c, rest: tokens.slice(k), used: tokens.slice(0, k).map(t => t.v).join(' ') };
  }
  return null;
}

function parseArgs(tokens, c) {
  const args = { _: [], named: {} };
  const allowed = c.flags || [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const low = t.v.toLowerCase();
    let key = null;
    if (!t.quoted && /^-[a-z]/i.test(t.v) && (!c.text || low === '-date')) key = FLAG_WORDS[low.slice(1)] || low.slice(1);
    else if (!t.quoted && !c.text && FLAG_WORDS[low] && allowed.includes(FLAG_WORDS[low])) key = FLAG_WORDS[low];
    if (key) {
      const next = tokens[i + 1];
      if (VALUE_FLAGS.has(key)) { if (next) { args.named[key] = next.v; i++; } else args.named[key] = true; }
      else if (key === 'week' || key === 'days') {
        if (next && /^\d+$/.test(next.v)) { args.named[key] = next.v; i++; }
        else if (key === 'days' && /^\d+$/.test(args._[args._.length - 1] || '')) args.named.days = args._.pop();
        else args.named[key] = true;
      } else args.named[key] = true;
    } else if (!t.quoted && c.formats && FORMAT_WORDS[low]) args.named.format = FORMAT_WORDS[low];
    else if (!t.quoted && !c.text && ['deze', 'van', 'de', 'het'].includes(low)) continue; // vulwoorden: "deze week", "van de maand"
    else args._.push(t.v);
  }
  if (args.named.prev) { if (!args.named.week || args.named.week === true) args.named.week = '1'; delete args.named.prev; }
  return args;
}

function parse(line) {
  const tokens = tokenize(line);
  const hit = matchCommand(tokens);
  if (!hit) return { cmd: tokens[0]?.v || '', c: null, args: { _: [], named: {} } };
  return { cmd: hit.used, c: hit.c, args: parseArgs(hit.rest, hit.c) };
}

async function run(line) {
  const { cmd, c, args } = parse(line);
  if (!cmd) return;
  if (!c) {
    const core = norm(cmd).replace(/^(get|new|set|add|remove)/, '');
    const sugg = core ? COMMANDS.filter(x => norm(x.name).includes(core) || x.alias.some(a => norm(a).includes(core))).slice(0, 3) : [];
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
    if (e instanceof Cancel) say(c.name === 'new log' && load(LS_DRAFT, null) ? 'Afgebroken. 💾 Je concept is bewaard: typ new log om verder te gaan.' : 'Afgebroken.', 'dim');
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

class ModelGone extends Error {}

async function aiCall(system, user, opts = {}) {
  if (!aiReady()) throw new UserError('AI is niet ingesteld. Typ set config.');
  const p = settings.provider;
  const tried = new Set();
  let model = settings.models[p];
  for (;;) {
    tried.add(model);
    try {
      const res = await aiRequest(model, system, user, opts);
      if (settings.models[p] !== model) { settings.models[p] = model; saveSettings(); say(`ℹ AI-model automatisch gewisseld naar ${model}.`, 'dim'); }
      return res;
    } catch (e) {
      if (!(e instanceof ModelGone)) throw e;
      const next = MODEL_FALLBACKS[p].find(m => !tried.has(m));
      if (!next) throw new UserError(`Geen werkend AI-model gevonden. Stel er zelf een in met: set config model <naam>`);
      model = next;
    }
  }
}

async function aiRequest(model, system, user, { json = true, temperature = 0.4 } = {}) {
  const p = settings.provider;
  const key = settings.keys[p];
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
    if ((res.status === 400 && /api key/i.test(msg)) || res.status === 401 || res.status === 403) throw new UserError('API-sleutel ongeldig. Typ set config om hem opnieuw in te stellen.');
    if (res.status === 404 || /decommission|not found|does not exist|no longer|not supported/i.test(msg)) throw new ModelGone(model);
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
// ── datumkiezer: kalender + snelknoppen (werkt met muis, vinger of typen) ──
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

async function pickDate(question, { onlyLogged = false, step = null } = {}) {
  const t = today();
  const wrap = print(`<div class="datepick">
    ${step ? `<div class="step-top"><span class="step-n">STAP ${step[0]}/${step[1]}</span><span class="step-bar"><i style="--p:${step[0] / step[1]}"></i></span></div>` : ''}
    <div class="step-title"><span class="step-ico">📅</span> <span class="st"></span><span class="step-req">● KIES EEN DATUM</span></div>
    <div class="step-hint">${esc(question)}</div>
    <div class="dp-chips"></div>
    <div class="dp-cal"></div>
    <div class="dp-hint">Tik op een dag in de kalender, kies een knop of typ een datum (bv. <b>3-11</b> of <b>gisteren</b>).${onlyLogged ? ' Alleen dagen met een log (<span class="dp-dot"></span>) kunnen' + (logs[t] ? '; leeg = vandaag.' : '.') : ' Leeg = vandaag.'}</div>
  </div>`);
  scramble(wrap.querySelector('.st'), 'DATUM');
  const choose = iso => { if (pending && !wrap.classList.contains('done')) { input.value = iso; submit(); } };

  const chips = wrap.querySelector('.dp-chips');
  const quick = [['Vandaag', t], ['Gisteren', addDays(t, -1)], ['Eergisteren', addDays(t, -2)]];
  if (onlyLogged) { const last = sortedDates().reverse().slice(0, 3); quick.splice(0, 3, ...last.map(d => [shortDay(d), d])); }
  for (const [label, d] of quick) {
    const b = document.createElement('button');
    b.className = 'dp-chip' + (logs[d] ? ' has' : '');
    b.innerHTML = `<b>${esc(label)}</b><span>${esc(fromIso(d).toLocaleDateString('nl', { weekday: 'short', day: 'numeric', month: 'short' }))}</span>${logs[d] ? '<i>✓ log</i>' : ''}`;
    b.addEventListener('click', () => choose(d));
    chips.appendChild(b);
  }

  const cal = wrap.querySelector('.dp-cal');
  let view = fromIso(t); view.setDate(1);
  let selected = null;
  const render = () => {
    const y = view.getFullYear(), m = view.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7;
    const n = new Date(y, m + 1, 0).getDate();
    let html = `<div class="cal-head"><button class="cal-nav" data-nav="-1">‹</button><span>${MONTHS[m]} ${y}</span><button class="cal-nav" data-nav="1">›</button></div>
      <div class="cal-grid">${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => `<span class="cal-wd">${d}</span>`).join('')}`;
    for (let i = 0; i < first; i++) html += '<span></span>';
    for (let d = 1; d <= n; d++) {
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
      const wd = (first + d - 1) % 7;
      const cls = ['cal-day', logs[iso] && 'has', iso === t && 'today', iso > t && 'future', wd > 4 && 'wknd', iso === selected && 'sel', onlyLogged && !logs[iso] && 'off'].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-d="${iso}">${d}</button>`;
    }
    cal.innerHTML = html + '</div>';
  };
  cal.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { view.setMonth(view.getMonth() + +nav.dataset.nav); render(); return; }
    const day = e.target.closest('[data-d]');
    if (day && !day.classList.contains('off')) choose(day.dataset.d);
  });
  render();

  for (;;) {
    const v = (await ask('', { hint: 'datum', prose: false })).trim();
    const d = v ? parseDate(v) : (onlyLogged ? (logs[t] ? t : null) : t);
    if (!d) { say(v ? '⚠ Die datum snap ik niet. Probeer bv. 3-11, 2026-11-03 of gisteren.' : '⚠ Kies een dag met een log.', 'warn'); continue; }
    if (onlyLogged && !logs[d]) { say(`⚠ Op ${longDate(d)} heb je geen log. Kies een dag met een stipje.`, 'warn'); continue; }
    if (d > t && !(await yes(`⚠ ${capDate(d)} ligt in de toekomst. Toch deze datum? [j/N]`, false))) continue;
    selected = d; view = fromIso(d); view.setDate(1); render();
    wrap.classList.add('done');
    say(`📅 ${capDate(d)}${logs[d] ? '  (heeft al een log)' : ''}`, 'ok');
    return d;
  }
}

function stepHeader(i, total, f, extra = '') {
  const d = print(`<div class="step">
    <div class="step-top"><span class="step-n">STAP ${i}/${total}</span><span class="step-bar"><i style="--p:${i / total};--from:${(i - 1) / i}"></i></span></div>
    <div class="step-title"><span class="step-ico">${f.icon}</span> <span class="st"></span>${f.required ? '<span class="step-req">● VERPLICHT</span>' : ''}</div>
    <div class="step-hint">${esc(f.hint || '')}</div>${extra}</div>`);
  scramble(d.querySelector('.st'), f.title.toUpperCase());
}

async function cmdNewLog(a) {
  const steps = [...TEXT_FIELDS, ...LIST_FIELDS];
  const TOTAL = steps.length + 1; // + datum
  const given = a.named.date ?? a._.join(' ');
  print('<span class="section">◆ NEW LOG</span>');
  let date;
  if (given && given !== true) {
    date = parseDate(given);
    if (!date) throw new UserError('Ongeldige datum. Gebruik bv. 3-11, 2026-11-03, vandaag of gisteren.');
    say(`📅 ${capDate(date)}`, 'ok');
  } else date = await pickDate('Voor welke dag schrijf je deze log?', { step: [1, TOTAL] });
  let raw = null;
  let startStep = 0;

  // onafgewerkt concept? (app gesloten, ^C, batterij leeg…)
  const draft = load(LS_DRAFT, null);
  if (draft && draft.date === date && draft.raw) {
    say(`💾 Je was nog bezig met deze log (stap ${Math.min(draft.step + 2, TOTAL)}/${TOTAL}).`, 'info');
    const c = (await ask('[V]erder gaan waar je was  /  [O]pnieuw beginnen', { prose: false })).trim().toLowerCase();
    if (!c.startsWith('o')) { raw = normalize(draft.raw, date); startStep = draft.step; }
    else clearDraft();
  }

  if (!raw) {
    raw = normalize({}, date);
    if (logs[date]) {
      say('Er bestaat al een log voor deze dag:', 'dim');
      showLog(logs[date]);
      const c = (await ask('[A]anvullen, [B]ewerken (edit log), [O]pnieuw beginnen of [S]toppen?', { prose: false })).trim().toLowerCase();
      if (c.startsWith('a')) raw = normalize(JSON.parse(JSON.stringify(logs[date])), date);
      else if (c.startsWith('b')) return cmdEditLog({ _: [date], named: {} });
      else if (!c.startsWith('o')) { say('Niets veranderd.', 'dim'); return; }
    }
  }

  if (startStep === 0) { const carry = carryOverHtml(date); if (carry) print(carry); }
  const saveDraft = step => save(LS_DRAFT, { date, raw, step, t: Date.now() });

  for (let i = startStep; i < steps.length; i++) {
    const f = steps[i];
    if (TEXT_FIELDS.includes(f)) {
      const prev = raw[f.key] || (f.remember ? lastValue(f.key, date) : '');
      stepHeader(i + 2, TOTAL, f);
      say(f.q + (prev ? `   (leeg = "${prev}", - = leeg laten)` : '   (leeg = overslaan)'), 'q');
      let v = (await ask('', { hint: f.label })).trim();
      v = v === '-' ? '' : (v || prev);
      while (f.key === 'uren' && v && parseHours(v) == null) {
        say('⚠ Die uren kan ik niet uitrekenen. Schrijf bv. 09:00-17:30, 9u-17u30 of 14:00-23:30 pauze 30', 'warn');
        const again = (await ask('', { hint: f.label })).trim();
        if (!again) break; // leeg = toch zo houden
        v = again === '-' ? '' : again;
      }
      if (f.key === 'uren' && parseHours(v) != null) say(`   = ${fmtMins(parseHours(v))} gewerkt`, 'dim');
      raw[f.key] = v;
    } else {
      const have = raw[f.key];
      const extra = have.length ? `<div class="prev">al ingevuld: ${have.map(t => `<span class="item">${esc(t)}</span>`).join(' · ')}</div>` : '';
      stepHeader(i + 2, TOTAL, f, extra);
      say(f.q + '   (één per regel, lege regel = volgende stap)', 'q');
      let items = await askList(f.label, have.length + 1);
      while (f.required && !have.length && !items.length) {
        say(`⚠ "${f.title}" is verplicht in je logboek. Vul minstens één ding in.`, 'warn');
        items = await askList(f.label, 1);
      }
      raw[f.key] = [...have, ...items];
    }
    saveDraft(i + 1);
  }

  let final = raw;
  if (aiReady()) {
    print('');
    if (await yes('🤖 AI laten doorvragen en je spelling/vaktermen laten nakijken? [J/n]')) {
      final = (await aiPolish(date, raw)) || raw;
    }
  } else {
    say('Tip: koppel gratis AI met set config. Dan vraagt hij door en verbetert hij spelling en vaktermen.', 'dim');
  }

  showLog(final);
  let choice = 'j';
  if (final !== raw) choice = (await ask('Opslaan? [J]a  /  [E]igen versie (zonder AI)  /  [N]ee', { prose: false })).trim().toLowerCase() || 'j';
  else if (!(await yes('Opslaan? [J/n]'))) choice = 'n';

  if (choice.startsWith('n')) { say('Niet opgeslagen. Je concept blijft bewaard: typ new log om verder te gaan.', 'warn'); return; }
  const chosen = choice.startsWith('e') ? raw : final;
  logs[date] = { ...normalize(chosen, date), raw: pick(raw), updated: Date.now() };
  saveLogs();
  clearDraft();
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

async function cmdEditLog(a) {
  if (!logCount()) throw new UserError('Je hebt nog geen logs om te bewerken. Begin met: new log');
  const given = a.named.date ?? a._.join(' ');
  const date = given && given !== true ? parseDate(given) : await pickDate('Welke dag wil je bewerken?', { onlyLogged: true });
  if (!date) throw new UserError('Ongeldige datum.');
  if (!logs[date]) throw new UserError(`Geen log voor ${longDate(date)}. Maak er een met: new log ${date}`);
  const e = normalize(JSON.parse(JSON.stringify(logs[date])), date);
  const fields = [...TEXT_FIELDS, ...LIST_FIELDS];
  let changed = false;
  print(`<span class="section">✎ EDIT-LOG</span> <span class="b">${esc(capDate(date))}</span>`);
  for (;;) {
    showLog(e);
    print(fields.map((f, i) => `<span class="info">[${String(i + 1).padStart(2)}]</span> ${f.icon} ${esc(f.short || f.title)} <span class="dim">${TEXT_FIELDS.includes(f) ? esc(e[f.key] || '—') : `(${e[f.key].length} item${e[f.key].length === 1 ? '' : 's'})`}</span>`).join('\n'));
    const c = (await ask('Welk onderdeel wil je aanpassen? Typ het nummer (leeg = klaar)', { hint: 'onderdeel', prose: false })).trim();
    if (!c) break;
    const f = fields[parseInt(c, 10) - 1];
    if (!f) { say('Kies een nummer uit de lijst.', 'warn'); continue; }
    if (TEXT_FIELDS.includes(f)) {
      const pr = ask(`${esc(f.title)} <span class="dim">(leeg = houden, - = wissen)</span>`, { hint: f.label });
      input.value = e[f.key];
      const v = (await pr).trim();
      if (v && v !== e[f.key]) { e[f.key] = v === '-' ? '' : v; changed = true; }
      if (f.key === 'uren' && e.uren && parseHours(e.uren) == null) say('⚠ Deze uren kan ik niet uitrekenen; ze tellen niet mee in het urenoverzicht.', 'warn');
    } else if (await editList(e, f)) changed = true;
  }
  if (!changed) { say('Niets veranderd.', 'dim'); return; }
  for (const f of LIST_FIELDS) if (f.required && !e[f.key].length) say(`⚠ "${f.title}" is nu leeg, terwijl het verplicht is.`, 'warn');
  logs[date] = { ...e, updated: Date.now() };
  saveLogs();
  fireGo('LOG BIJGEWERKT');
  say('✔ Wijzigingen opgeslagen.', 'ok glow');
}

async function editList(e, f) {
  let changed = false;
  for (;;) {
    const items = e[f.key];
    print(`<span class="section">${f.icon} ${esc(f.title.toUpperCase())}</span>`);
    print(items.length ? items.map((t, i) => `<span class="info">${String(i + 1).padStart(2)}.</span> ${highlight(t)}`).join('\n') : '<span class="dim">— leeg —</span>');
    const c = (await ask('[T] toevoegen · [W 2] nummer 2 wijzigen · [V 1] nummer 1 verwijderen · leeg = terug', { hint: 'actie', prose: false })).trim().toLowerCase();
    if (!c) return changed;
    const m = c.match(/^([twv])[a-z]*\s*(\d+)?$/);
    if (!m) { say('Typ bv. t, w 2 of v 1.', 'warn'); continue; }
    const n = m[2] ? parseInt(m[2], 10) - 1 : (items.length === 1 ? 0 : -1);
    if (m[1] === 't') {
      const add = await askList(f.label, items.length + 1);
      if (add.length) { items.push(...add); changed = true; }
    } else if (n < 0 || n >= items.length) {
      say('Dat nummer bestaat niet. Typ bv. w 2', 'warn');
    } else if (m[1] === 'w') {
      const pr = ask('Pas de tekst aan (leeg = houden):', { hint: `${f.label} ${n + 1}` });
      input.value = items[n];
      const v = (await pr).trim();
      if (v && v !== items[n]) { items[n] = v; changed = true; }
    } else {
      const [gone] = items.splice(n, 1);
      changed = true;
      say(`✔ Verwijderd: ${gone}`, 'ok');
    }
  }
}

const mark = (t, q) => {
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? highlight(t) : esc(t.slice(0, i)) + `<span class="hit">${esc(t.slice(i, i + q.length))}</span>` + esc(t.slice(i + q.length));
};

async function cmdFind(a) {
  let q = a._.join(' ').trim();
  if (!q) q = (await ask('Waar zoek je naar? (bv. dimmer, Eos, Hamlet, moving head)', { hint: 'zoek' })).trim();
  if (!q) return;
  const ql = q.toLowerCase();
  let hits = 0;
  for (const d of sortedDates().reverse()) {
    const e = logs[d];
    const found = [];
    for (const f of TEXT_FIELDS) if (e[f.key].toLowerCase().includes(ql)) found.push([f, e[f.key]]);
    for (const f of LIST_FIELDS) for (const t of e[f.key]) if (t.toLowerCase().includes(ql)) found.push([f, t]);
    if (!found.length) continue;
    hits += found.length;
    const row = print(`<span class="info">${d}</span> <span class="dim">${esc(shortDay(d))}${e.productie ? ' · ' + esc(e.productie) : ''}  ↗</span>`, 'row-link');
    row.addEventListener('click', () => runFromUi(`get log ${d}`));
    for (const [f, t] of found) print(`   <span class="dim">${f.icon} ${esc(f.short || f.title)}:</span> ${mark(t, q)}`);
  }
  say(hits ? `${hits} resultaat${hits === 1 ? '' : 'en'} voor "${q}". Klik een datum om de hele log te openen.` : `Niets gevonden voor "${q}".`, hits ? 'dim' : 'warn');
}

async function cmdGetLog(a) {
  const date = parseDate(a.named.date ?? a._.join(' '));
  if (!date) throw new UserError('Ongeldige datum.');
  if (!logs[date]) {
    say(`Geen log gevonden voor ${longDate(date)}.`, 'warn');
    if (date === today()) print('<span class="dim">Start er een met </span><span class="info">new log</span><span class="dim"> of voeg snel iets toe met </span><span class="info">add taak</span>');
    return;
  }
  showLog(logs[date]);
}

async function cmdGetLogs() {
  const dates = sortedDates().reverse();
  if (!dates.length) { say('Nog geen logs. Begin met new log.', 'warn'); return; }
  const wrap = print('', '');
  const t = document.createElement('div');
  t.className = 'table';
  t.innerHTML = `<span class="th">Datum</span><span class="th wd">Dag</span><span class="th">Productie</span><span class="th num">Uren</span><span class="th num">Taken</span>`;
  for (const d of dates) {
    const e = logs[d];
    const row = document.createElement('div');
    row.className = 'row';
    row.title = 'Klik om te openen';
    row.innerHTML = `<span class="info">${d}</span><span class="dim wd">${esc(shortDay(d))}</span><span>${esc(e.productie || e.taken[0] || '—')}${e.locatie ? ` <span class="dim">@ ${esc(e.locatie)}</span>` : ''}</span><span class="num">${fmtMins(parseHours(e.uren)) || '—'}</span><span class="num">${e.taken.length}</span>`;
    row.addEventListener('click', () => runFromUi(`get log ${d}`));
    t.appendChild(row);
  }
  wrap.appendChild(t);
  const mins = dates.reduce((n, d) => n + (parseHours(logs[d].uren) || 0), 0);
  say(`${dates.length} log(s)${mins ? ` · ${fmtMins(mins)} gewerkt in totaal` : ''}. Klik een rij of typ: get log <datum>`, 'dim');
  scrollDown();
}

async function cmdRemoveLog(a) {
  if (!logCount()) throw new UserError('Er zijn geen logs om te verwijderen.');
  const given = a.named.date ?? a._.join(' ');
  const date = given && given !== true ? parseDate(given) : await pickDate('Welke log wil je verwijderen?', { onlyLogged: true });
  if (!date || !logs[date]) throw new UserError('Geen log gevonden voor die datum. Gebruik: remove log 2026-11-03');
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
  if (a.named.month) { from = today().slice(0, 8) + '01'; to = today(); }
  if (a.named.week) {
    const back = a.named.week === true ? 0 : parseInt(a.named.week, 10) || 0;
    const d = new Date(); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd - 7 * back);
    from = iso(d); to = addDays(from, 6);
  }
  if ((a.named.from && !from) || (a.named.to && !to)) throw new UserError('Ongeldige datum bij -From of -To.');
  return dates.filter(d => (!from || d >= from) && (!to || d <= to));
}

async function aiSummaryText(dates) {
  const data = dates.map(d => pick(logs[d]));
  return aiCall(`Je maakt een samenvatting van een stagelogboek, in het Nederlands, in de ik-vorm, voor een stageverslag. ${context()}
Gebruik exact deze kopjes in HOOFDLETTERS, elk op een eigen regel (gewone tekst, geen markdown-sterretjes of #):
OVERZICHT
(2-3 zinnen: aan welke producties en waar ik gewerkt heb)
BELANGRIJKSTE TAKEN
(opsomming, elke regel begint met "- ")
MATERIAAL & TECHNIEK
(opsomming met "- " van tafels/toestellen/technieken waarmee ik werkte)
WAT IK GELEERD HEB
(opsomming met "- ", geformuleerd als competenties: "Ik kan nu …")
FOUTEN & HOE IK ERMEE OMGING
(opsomming met "- "; laat dit kopje weg als er geen fouten zijn)
GROEIPUNTEN
(opsomming met "- ", gebaseerd op "meenemen")
Verzin niets dat niet in de logs staat.`, JSON.stringify(data), { json: false });
}

async function cmdSummary(a) {
  if (!a.named.days && !a.named.week && !a.named.from && !a.named.month && !a.named.all) a.named.days = '7';
  const dates = rangeFromArgs(a);
  if (!dates.length) throw new UserError('Geen logs in die periode.');
  if (!aiReady()) throw new UserError('Hiervoor heb je AI nodig. Typ set config.');
  const stop = spinner(`AI vat ${dates.length} dag(en) samen`);
  let text;
  try { text = await aiSummaryText(dates); stop(`✔ Samenvatting ${dates[0]} → ${dates[dates.length - 1]}`, 'ok'); }
  catch (e) { stop('✖ ' + e.message, 'err'); return; }
  await typeOut(text);
  const link = print('<a href="#">📋 kopieer samenvatting</a>').querySelector('a');
  link.addEventListener('click', async e => {
    e.preventDefault();
    try { await navigator.clipboard.writeText(text); link.textContent = '✔ gekopieerd'; } catch { link.textContent = 'kopiëren lukte niet'; }
  });
}

// ── export ────────────────────────────────────────────────
// documentkleuren per gel: [hoofdkleur, tweede kleur, fel (voorpagina), donker, licht]
const DOC_COLORS = {
  congo:   ['3730A3', '0E7490', '22D3EE', '0B0F22', 'EEF0FB'],
  amber:   ['B45309', '9A3412', 'FBBF24', '1C1208', 'FDF5E6'],
  magenta: ['A21CAF', '6D28D9', 'FF4FD8', '1A0820', 'FBEFFC'],
  peacock: ['0F766E', '0E7490', '2DD4BF', '061A1A', 'E9F7F5'],
  red:     ['B91C1C', 'C2410C', 'FF4D4D', '1E0707', 'FDEEEE'],
  uv:      ['6D28D9', 'BE185D', 'A78BFA', '120A24', 'F3EEFD'],
};

function buildReport(dates, summary = '') {
  const shortFmt = d => fromIso(d).toLocaleDateString('nl', { weekday: 'short', day: 'numeric', month: 'short' });
  const days = dates.map(d => {
    const e = logs[d];
    const mins = parseHours(e.uren);
    return { date: d, title: capDate(d), short: shortFmt(d), e, mins, hoursText: fmtMins(mins) };
  });
  const prodMap = new Map();
  for (const d of days) if (d.e.productie) prodMap.set(d.e.productie, (prodMap.get(d.e.productie) || 0) + 1);
  const matMap = new Map();
  for (const d of days) for (const m of d.e.materiaal) { const k = m.trim(); matMap.set(k, (matMap.get(k) || 0) + 1); }
  const totalMins = days.reduce((n, d) => n + (d.mins || 0), 0);
  const c = DOC_COLORS[settings.theme] || DOC_COLORS.congo;
  const from = fromIso(dates[0]).toLocaleDateString('nl', { day: 'numeric', month: 'long', year: 'numeric' });
  const to = fromIso(dates[dates.length - 1]).toLocaleDateString('nl', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    name: settings.name, opleiding: settings.opleiding, stageplek: settings.stageplek, mentor: settings.mentor,
    periodText: dates.length > 1 ? `${from} – ${to}` : from,
    generated: new Date().toLocaleDateString('nl', { day: 'numeric', month: 'long', year: 'numeric' }),
    days, summary,
    totals: {
      hoursText: totalMins ? fmtMins(totalMins) : '—',
      unparsed: days.filter(d => d.e.uren && d.mins == null).length,
      taken: days.reduce((n, d) => n + d.e.taken.length, 0),
      geleerd: days.reduce((n, d) => n + d.e.geleerd.length, 0),
    },
    producties: [...prodMap.entries()],
    materiaal: [...matMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k]) => k),
    textFields: TEXT_FIELDS.map(f => ({ key: f.key, title: f.title })),
    listFields: LIST_FIELDS.map(f => ({ key: f.key, title: f.short, required: !!f.required })),
    colors: { p: c[0], s: c[1], bright: c[2], dark: c[3], light: c[4] },
  };
}

function buildMarkdown(rep) {
  const L = [`# Stagelogboek${rep.name ? ' — ' + rep.name : ''}`, ''];
  for (const [k, v] of [['Opleiding', rep.opleiding], ['Stageplek', rep.stageplek], ['Stagebegeleider', rep.mentor], ['Periode', rep.periodText], ['Totaal uren', rep.totals.hoursText]]) if (v) L.push(`**${k}:** ${v}  `);
  L.push('');
  if (rep.summary) L.push('## Samenvatting', '', rep.summary, '');
  for (const d of rep.days) {
    L.push('---', '', `## ${d.title}`, '');
    for (const f of rep.textFields) if (d.e[f.key]) L.push(`**${f.title}:** ${d.e[f.key]}${f.key === 'uren' && d.hoursText ? ` (${d.hoursText})` : ''}  `);
    L.push('');
    for (const f of rep.listFields) {
      if (!d.e[f.key].length && !f.required) continue;
      L.push(`### ${f.title}`, '');
      (d.e[f.key].length ? d.e[f.key] : ['—']).forEach(t => L.push(`- ${t}`));
      L.push('');
    }
  }
  L.push('---', '', '## Urenoverzicht', '', '| Datum | Productie | Werkuren | Duur |', '|---|---|---|---|');
  for (const d of rep.days) L.push(`| ${d.date} | ${d.e.productie || '—'} | ${d.e.uren || '—'} | ${d.hoursText || '—'} |`);
  L.push(`| **Totaal** | | | **${rep.totals.hoursText}** |`, '');
  return L.join('\n');
}

function buildPrintHtml(rep) {
  const C = rep.colors;
  const fmt = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\b(Probleem|Oorzaak|Oplossing|Geleerd|Fout):/g, '<b>$1:</b>');
  const secColor = { fouten: '#B91C1C', geleerd: '#047857', meenemen: '#B45309', taken: '#' + C.p };
  const info = [['Stagiair', rep.name], ['Opleiding', rep.opleiding], ['Stageplek', rep.stageplek], ['Stagebegeleider', rep.mentor], ['Periode', rep.periodText], ['Aantal logdagen', rep.days.length], ['Totaal gewerkte uren', rep.totals.hoursText]].filter(([, v]) => v);
  const sumHtml = rep.summary ? `<section class="pg"><h1>Samenvatting</h1>${rep.summary.split('\n').map(l => l.trim()).filter(Boolean).map(l => /^[-•*]\s/.test(l) ? `<li>${fmt(l.replace(/^[-•*]\s+/, ''))}</li>` : /^[A-ZÀ-Ý &/'-]{4,}$/.test(l) ? `<h2>${esc(l)}</h2>` : `<p>${fmt(l)}</p>`).join('').replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`)}</section>` : '';
  const daysHtml = rep.days.map((d, i) => {
    const meta = rep.textFields.filter(f => d.e[f.key]).map(f => `<div><small>${esc(f.title)}</small><b>${esc(d.e[f.key])}</b></div>`).join('');
    const secs = rep.listFields.filter(f => d.e[f.key].length || f.required).map(f => `<h2 style="color:${secColor[f.key] || '#' + C.s}">■ ${esc(f.title)}</h2><ul>${(d.e[f.key].length ? d.e[f.key] : ['—']).map(t => `<li>${fmt(t)}</li>`).join('')}</ul>`).join('');
    return `<section class="pg"><h1>${esc(d.title)}</h1><p class="sub"><b>DAG ${i + 1}</b> · ${d.date}${d.hoursText ? ` · ${d.hoursText} gewerkt` : ''}</p>${meta ? `<div class="meta">${meta}</div>` : ''}${secs}</section>`;
  }).join('');
  return `<style>
  #print-area{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;color:#1f2333;line-height:1.4}
  #print-area .pg{page-break-before:always}
  #print-area b,#print-area strong{color:inherit;font-weight:700}
  #print-area code{color:#1f2333}
  #print-area *{text-shadow:none;animation:none}
  #print-area h1{font-size:20pt;color:#${C.p};border-bottom:2px solid #${C.p};padding-bottom:4pt;margin:0 0 8pt}
  #print-area h2{font-size:10pt;text-transform:uppercase;letter-spacing:.5pt;margin:12pt 0 3pt;color:#${C.p}}
  #print-area .sub{color:#6b6f80;font-size:9pt;margin:0 0 8pt}
  #print-area ul{margin:0 0 0 16pt;padding:0}#print-area li{margin:2pt 0}
  #print-area code{font-family:Consolas,monospace;background:#f1f1f6;font-size:9.5pt}
  #print-area .meta{display:flex;gap:6pt;margin:6pt 0}#print-area .meta div{flex:1;background:#${C.light};padding:6pt 8pt}
  #print-area .meta small{display:block;font-size:7.5pt;font-weight:700;color:#${C.p};text-transform:uppercase;letter-spacing:.5pt}
  #print-area .cover{background:#${C.dark};color:#fff;padding:36pt 30pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #print-area .cover .k{font-family:Consolas,monospace;color:#${C.bright};font-weight:700;font-size:9pt;letter-spacing:1pt}
  #print-area .cover .t{font-size:36pt;font-weight:800;letter-spacing:1.5pt;margin:24pt 0 6pt}
  #print-area .cover .o{color:#${C.bright};font-size:16pt;font-weight:700}
  #print-area .cover .n{font-size:15pt;margin-top:4pt}
  #print-area table{width:100%;border-collapse:collapse;margin:6pt 0}
  #print-area td,#print-area th{padding:5pt 7pt;border-bottom:1px solid #dcdce8;text-align:left;font-size:9.5pt}
  #print-area th{background:#${C.p};color:#fff;text-transform:uppercase;font-size:8pt;letter-spacing:.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #print-area .infotbl td:first-child{color:#6b6f80;font-weight:700;font-size:8pt;text-transform:uppercase;width:35%}
  #print-area .tot td{background:#${C.light};font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #print-area .sign{display:flex;gap:30pt;margin-top:14pt}#print-area .sign div{flex:1;color:#6b6f80;line-height:2.6}
  </style>
  <div class="cover"><div class="k">❯_ STAGELOG TERMINAL</div><div class="t">STAGELOGBOEK</div><div class="o">${esc(rep.opleiding || '')}</div><div class="n">${esc(rep.name || '')}</div></div>
  <table class="infotbl">${info.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>
  <section class="pg"><h1>Overzicht</h1>
  ${rep.producties.length ? `<h2>Producties</h2><ul>${rep.producties.map(([p, n]) => `<li><b>${esc(p)}</b> — ${n} dag${n > 1 ? 'en' : ''}</li>`).join('')}</ul>` : ''}
  ${rep.materiaal.length ? `<h2>Materiaal &amp; techniek</h2><p>${rep.materiaal.map(esc).join(' · ')}</p>` : ''}
  <h2>Dagoverzicht</h2><table><tr><th>Datum</th><th>Productie</th><th>Locatie</th><th>Uren</th></tr>${rep.days.map(d => `<tr><td>${esc(d.short)}</td><td>${esc(d.e.productie || '—')}</td><td>${esc(d.e.locatie || '—')}</td><td>${esc(d.hoursText || d.e.uren || '—')}</td></tr>`).join('')}</table></section>
  ${sumHtml}${daysHtml}
  <section class="pg"><h1>Urenoverzicht</h1><table><tr><th>Datum</th><th>Productie</th><th>Werkuren</th><th>Duur</th></tr>${rep.days.map(d => `<tr><td>${esc(d.short)}</td><td>${esc(d.e.productie || '—')}</td><td>${esc(d.e.uren || '—')}</td><td>${esc(d.hoursText || '—')}</td></tr>`).join('')}<tr class="tot"><td colspan="3">TOTAAL</td><td>${esc(rep.totals.hoursText)}</td></tr></table>
  <h2>Ondertekening</h2><div class="sign"><div><b>Stagiair</b><br>${esc(rep.name || '')}<br>Datum: ____________<br>Handtekening: ____________</div><div><b>Stagebegeleider</b><br>${esc(rep.mentor || '')}<br>Datum: ____________<br>Handtekening: ____________</div></div></section>`;
}

async function deliver(blob, filename) {
  // iPad/iPhone: deelmenu (openen in Word, bewaren in Bestanden, mailen…). Anders: gewone download.
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'aborted'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
const download = (name, content, type) => deliver(new Blob([content], { type }), name);

async function askPeriod(a) {
  if (a.named.from || a.named.to || a.named.week || a.named.days || a.named.all || a.named.month) return rangeFromArgs(a);
  const all = sortedDates();
  if (!all.length) throw new UserError('Nog geen logs om te exporteren.');
  print(`Welke periode? <span class="info">[A]</span> alles <span class="dim">(${all.length} dagen)</span> · <span class="info">[W]</span> deze week · <span class="info">[V]</span> vorige week · <span class="info">[M]</span> deze maand · <span class="info">[D]</span> zelf kiezen`, 'q');
  const c = (await ask('', { hint: 'periode', prose: false })).trim().toLowerCase() || 'a';
  if (c.startsWith('w')) return rangeFromArgs({ named: { week: '0' } });
  if (c.startsWith('v')) return rangeFromArgs({ named: { week: '1' } });
  if (c.startsWith('m')) { const t = today(); return rangeFromArgs({ named: { from: t.slice(0, 8) + '01', to: t } }); }
  if (c.startsWith('d')) {
    const from = (await ask('Vanaf welke datum? (bv. 1-11)', { hint: 'van', prose: false })).trim();
    const to = (await ask('Tot welke datum? (leeg = vandaag)', { hint: 'tot', prose: false })).trim() || 'vandaag';
    return rangeFromArgs({ named: { from, to } });
  }
  return all;
}

async function cmdExport(a) {
  const dates = await askPeriod(a);
  if (!dates.length) throw new UserError('Geen logs in die periode.');
  let fmt = typeof a.named.format === 'string' ? a.named.format.toLowerCase() : '';
  if (!fmt) {
    say(`${dates.length} log(s) klaar om te exporteren (${dates[0]} → ${dates[dates.length - 1]}).`, 'dim');
    print(`Formaat? <span class="info">[W]</span> Word .docx <span class="dim">(aanrader — voorpagina, overzicht, urenlijst, handtekeningen)</span> · <span class="info">[P]</span> PDF · <span class="info">[M]</span> Markdown`, 'q');
    const c = (await ask('', { hint: 'formaat', prose: false })).trim().toLowerCase() || 'w';
    fmt = c.startsWith('p') ? 'pdf' : c.startsWith('m') ? 'md' : 'word';
  }
  let summary = '';
  if (aiReady() && fmt !== 'md' && !a.named.nosummary) {
    if (await yes('🤖 Een AI-samenvatting (geleerd, groeipunten…) toevoegen vooraan? [j/N]', false)) {
      const stop = spinner('AI schrijft de samenvatting');
      try { summary = await aiSummaryText(dates); stop('✔ Samenvatting klaar.', 'ok'); }
      catch (e) { stop('✖ ' + e.message + ' (export gaat door zonder samenvatting)', 'err'); }
    }
  }
  const rep = buildReport(dates, summary);
  const base = `stagelogboek${settings.name ? '-' + settings.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}-${dates[0]}${dates.length > 1 ? '_' + dates[dates.length - 1] : ''}`;
  let how;
  if (fmt === 'md' || fmt === 'markdown') {
    how = await download(`${base}.md`, buildMarkdown(rep), 'text/markdown;charset=utf-8');
  } else if (['word', 'doc', 'docx', 'w'].includes(fmt)) {
    const stop = spinner('Word-document opbouwen');
    const blob = window.StageDocx.build(rep);
    stop(`✔ Word-document klaar (${Math.max(1, Math.round(blob.size / 1024))} kB): voorpagina, overzicht, ${rep.days.length} dag(en), urenoverzicht.`, 'ok');
    how = await deliver(blob, `${base}.docx`);
  } else if (fmt === 'pdf') {
    $('#print-area').innerHTML = buildPrintHtml(rep);
    say('Printvenster opent… kies "Opslaan als PDF" (iPad: tik op Delen → Opslaan in Bestanden).', 'info');
    await sleep(250);
    window.print();
    how = 'printed';
  } else throw new UserError('Onbekend formaat. Kies word, pdf of md.');
  if (how === 'aborted') { say('Delen geannuleerd.', 'dim'); return; }
  if (how === 'downloaded') say('✔ Gedownload. Je vindt het bij je Downloads (iPad: app Bestanden → Downloads).', 'ok');
  if (how === 'shared') say('✔ Gedeeld.', 'ok');
  fireGo('EXPORT');
}

async function cmdBackup() {
  const { keys, ...safeSettings } = settings;
  const data = { app: 'StageLog', version: VERSION, exported: new Date().toISOString(), settings: safeSettings, logs };
  const how = await download(`stagelog-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  if (how === 'aborted') { say('Backup geannuleerd.', 'dim'); return; }
  settings.lastBackup = Date.now(); saveSettings();
  say(`✔ Backup van ${logCount()} log(s) gemaakt. Bewaar dit bestand goed (bv. in iCloud Drive of OneDrive).`, 'ok');
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
        for (const k of ['name', 'opleiding', 'stageplek', 'mentor', 'provider', 'theme', 'fx']) if (data.settings?.[k]) settings[k] = data.settings[k];
        if (data.settings?.models) settings.models = { ...settings.models, ...data.settings.models };
        if (settings.provider !== 'none' && !settings.keys[settings.provider]) say(`ℹ Plak je ${settings.provider}-sleutel opnieuw in met set config (sleutels zitten niet in backups).`, 'dim');
        saveSettings(); saveLogs(); applyLook(); renderPrompt();
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
    if (settings.provider === 'none') throw new UserError('Kies eerst een AI-provider met set config.');
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
  say('✔ Instellingen opgeslagen. Kies ook eens een kleurfilter met set theme 🎨', 'ok');
}

async function cmdTestAI() {
  if (!aiReady()) throw new UserError('Geen AI ingesteld. Typ set config.');
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
${lbl('Gewerkte uren')} <b>${fmtMins(dates.reduce((n, d) => n + (parseHours(logs[d].uren) || 0), 0)) || '—'}</b>
${lbl('Laatste backup')} ${settings.lastBackup ? esc(new Date(settings.lastBackup).toLocaleDateString('nl')) : '<span class="warn">nog nooit</span> <span class="dim">(backup logs)</span>'}
${LIST_FIELDS.map(f => `${lbl(f.icon + ' ' + f.short)} ${bar(counts[f.key])} <b>${counts[f.key]}</b>`).join('\n')}
${lbl('Producties')} ${topProds.length ? topProds.map(([p, n]) => `${esc(p)} <span class="dim">(${n}d)</span>`).join(' · ') : '—'}
${lbl('AI')} ${aiReady() ? `<span class="ok">● ${settings.provider}</span> <span class="dim">${esc(settings.models[settings.provider])}</span>` : '<span class="warn">○ uit</span> <span class="dim">(set config)</span>'}
${lbl('Gel / effecten')} ${esc(GELS[settings.theme]?.name || '')} · fx ${settings.fx}
${lbl('Versie')} v${VERSION}`);
}

function cmdHelp() {
  const groups = {};
  for (const c of COMMANDS) (groups[c.group] = groups[c.group] || []).push(c);
  print('<span class="section">◆ HELP</span> <span class="dim">— typ gewoon met spaties, bv. <b>new log</b> of <b>export word alles</b>. Tik op een commando om het te starten.</span>');
  const wrap = print('');
  const grid = document.createElement('div');
  grid.className = 'help-cards';
  for (const [g, cs] of Object.entries(groups)) {
    const card = document.createElement('div');
    card.className = 'help-card';
    card.innerHTML = `<h4>── ${esc(g.toUpperCase())}</h4>` + cs.map(c => `<div class="hc-row" data-cmd="${esc(c.name)}">
      <span class="hc-ico">${c.icon || '›'}</span><span class="hc-cmd">${esc(c.name)} ${c.alias.length ? `<span class="hc-al">· ${esc(c.alias.filter(a => !/[-]/.test(a)).slice(0, 3).join(' · '))}</span>` : ''}</span>
      <span class="hc-desc">${esc(c.desc)}</span>${c.usage ? `<span class="hc-use">${esc(c.usage)}</span>` : ''}</div>`).join('');
    grid.appendChild(card);
  }
  grid.addEventListener('click', e => { const r = e.target.closest('[data-cmd]'); if (r) runFromUi(r.dataset.cmd); });
  wrap.appendChild(grid);
  say('Tab = aanvullen · ↑↓ = vorige commando\'s · Ctrl+C = afbreken · Ctrl+L = scherm leeg', 'dim');
  say('Datums: vandaag · gisteren · vrijdag · 3-11 · 3 november · 2026-11-03', 'dim');
  scrollDown();
}

const COMMANDS = [
  { group: 'Loggen', icon: '▶', name: 'new log', alias: ['nl', 'new', 'log', 'nieuw', 'nieuwe log'], flags: ['date'], desc: 'Je log invullen — eerst kies je de datum, dan 10 stappen', usage: 'new log  ·  new log gisteren  ·  new log 3-11', fn: cmdNewLog },
  { group: 'Loggen', icon: '+', name: 'add taak', alias: ['taak', 'task', 'add task'], text: true, desc: 'Snel een taak toevoegen aan vandaag (ook tussendoor)', usage: 'add taak moving heads gepatcht op universe 2', fn: quickAdd('taken') },
  { group: 'Loggen', icon: '+', name: 'add fout', alias: ['fout'], text: true, desc: 'Snel iets toevoegen dat fout liep', usage: 'add fout dimmer 23 gaf geen output', fn: quickAdd('fouten') },
  { group: 'Loggen', icon: '+', name: 'add geleerd', alias: ['geleerd', 'les', 'add les', 'add lesson'], text: true, desc: 'Snel iets toevoegen dat je geleerd hebt', fn: quickAdd('geleerd') },
  { group: 'Loggen', icon: '+', name: 'add morgen', alias: ['morgen', 'todo'], text: true, desc: 'Iets noteren om mee te nemen naar morgen', fn: quickAdd('meenemen') },
  { group: 'Loggen', icon: '+', name: 'add wie', alias: ['wie'], text: true, desc: 'Iemand toevoegen die er vandaag was', fn: quickAdd('wie') },
  { group: 'Loggen', icon: '✎', name: 'edit log', alias: ['edit', 'bewerk', 'el', 'bewerk log'], flags: ['date'], desc: 'Een log achteraf aanpassen (kies de dag op de kalender)', usage: 'edit log  ·  edit log gisteren', fn: cmdEditLog },
  { group: 'Bekijken', icon: '◉', name: 'get log', alias: ['gl', 'show', 'cat', 'toon', 'bekijk'], flags: ['date'], desc: 'Bekijk de log van een dag', usage: 'get log  ·  get log gisteren  ·  get log 3-11', fn: cmdGetLog },
  { group: 'Bekijken', icon: '▤', name: 'get logs', alias: ['ls', 'dir', 'list', 'logs', 'alle logs'], desc: 'Overzicht van al je logs (met uren)', fn: cmdGetLogs },
  { group: 'Bekijken', icon: '⌕', name: 'find log', alias: ['find', 'zoek', 'search'], text: true, desc: 'Zoek in al je logs', usage: 'zoek dimmer  ·  zoek moving head', fn: cmdFind },
  { group: 'Bekijken', icon: '◆', name: 'get stats', alias: ['stats', 'whoami', 'statistieken'], desc: 'Statistieken, streak, uren en producties', fn: cmdStats },
  { group: 'Verslag', icon: '🤖', name: 'get summary', alias: ['sum', 'summary', 'samenvatting'], flags: ['week', 'days', 'from', 'to', 'all', 'month', 'prev'], desc: 'AI-samenvatting van een periode (voor je verslag)', usage: 'samenvatting  ·  samenvatting vorige week  ·  samenvatting 30 dagen', fn: cmdSummary },
  { group: 'Verslag', icon: '⇩', name: 'export verslag', alias: ['export', 'exporteer'], formats: true, flags: ['format', 'week', 'days', 'from', 'to', 'all', 'month', 'prev'], desc: 'Mooi Word-document (.docx), PDF of Markdown', usage: 'export  ·  export word alles  ·  export pdf vorige week  ·  export word van 1-11 tot 7-11', fn: cmdExport },
  { group: 'Beheer', icon: '✖', name: 'remove log', alias: ['rm', 'del', 'verwijder'], flags: ['date'], desc: 'Een log verwijderen', usage: 'remove log  ·  remove log 3-11', fn: cmdRemoveLog },
  { group: 'Beheer', icon: '💾', name: 'backup logs', alias: ['backup'], desc: 'Download een backup van alles (.json)', fn: cmdBackup },
  { group: 'Beheer', icon: '↺', name: 'restore logs', alias: ['restore', 'import', 'herstel'], desc: 'Zet een backup terug (ook pc ↔ iPad)', fn: cmdRestore },
  { group: 'Instellingen', icon: '⚙', name: 'set config', alias: ['setup', 'config', 'instellingen'], flags: ['model'], desc: 'Naam, opleiding, stageplek, mentor en gratis AI', usage: 'setup  ·  set config model gemini-2.5-flash', fn: cmdConfig },
  { group: 'Instellingen', icon: '🎨', name: 'set theme', alias: ['theme', 'gel', 'kleur', 'thema'], desc: 'Kies een kleurfilter (gel) voor de hele app', usage: 'gel  ·  gel amber', fn: cmdTheme },
  { group: 'Instellingen', icon: '✨', name: 'set fx', alias: ['fx', 'effects', 'effecten'], desc: 'Effecten: max / low / off', usage: 'fx low', fn: cmdFx },
  { group: 'Instellingen', icon: '📡', name: 'test ai', alias: ['ping'], desc: 'Test de AI-verbinding', fn: cmdTestAI },
  { group: 'Instellingen', icon: '⌫', name: 'clear', alias: ['cls', 'clear host'], desc: 'Scherm leegmaken', fn: async () => { out.innerHTML = ''; } },
  { group: 'Instellingen', icon: '?', name: 'help', alias: ['?', 'man', 'get help', 'hulp'], desc: 'Alle commando\'s', fn: async () => cmdHelp() },
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
    ['ok', 'Warming up lamps ...', 'warm'],
    ['ok', 'Haze machine ........................ ON'],
    aiReady() ? ['ok', `AI uplink: ${settings.provider} → ${settings.models[settings.provider]}`] : ['wn', 'AI uplink: niet geconfigureerd (set config)'],
  ];
  const truss = [...document.querySelectorAll('.truss i')];
  for (let i = 0; i < steps.length; i++) {
    const [t, msg, kind] = steps[i];
    print(`<span class="tag ${t}">[${t === 'ok' ? ' OK ' : 'WARN'}]</span> <span class="dim">${esc(msg)}</span>${kind === 'warm' ? '<span class="warm"><i></i></span><span class="dim">100%</span>' : ''}`, 'boot');
    if (kind === 'warm' && !fast) await sleep(900);
    if (!fast) await sleep(120 + Math.random() * 130);
    if (i === 3) stage.classList.add('on'); // lampen aan!
  }
  stage.classList.add('on');
  truss.forEach(x => x.style.opacity = '');
  try { sessionStorage.setItem('booted', '1'); } catch { /* ok */ }
  print('');

  const name = settings.name ? `, ${esc(settings.name)}` : '';
  print(`Welkom terug${name}. <span class="dim">Vandaag is</span> <b>${esc(longDate(today()))}</b>.`);
  if (logs[today()]) print(`<span class="ok">✔ Je log van vandaag staat er al.</span> <span class="dim">Bekijk met</span> <span class="info">get log</span><span class="dim">, aanvullen met</span> <span class="info">new log</span>`);
  else {
    print(`<span class="warn">● Nog geen log voor vandaag.</span> <span class="dim">Typ</span> <span class="info">new log</span> <span class="dim">of tik op ▶ new log. Alle commando's:</span> <span class="info">help</span>`);
    const carry = carryOverHtml(today());
    if (carry) print(carry);
  }

  bootHints();

  if (!settings.name) {
    print('');
    say('Eerste keer hier? Even instellen…', 'info');
    await sleep(fast ? 0 : 400);
    input.value = 'set config';
    submit();
  }
}

function bootHints() {
  const draft = load(LS_DRAFT, null);
  if (draft?.raw) print(`<span class="info">💾 Je hebt een onafgewerkte log van ${esc(longDate(draft.date))}.</span> <span class="dim">Ga verder met</span> <span class="info">new log ${draft.date}</span>`);
  // laatste werkdag zonder log (alleen als je de week ervoor wel logde)
  let d = addDays(today(), -1);
  while ([0, 6].includes(fromIso(d).getDay())) d = addDays(d, -1);
  const recent = sortedDates().some(x => x >= addDays(d, -7) && x < d);
  if (!logs[d] && recent && draft?.date !== d) print(`<span class="warn">● Geen log voor ${esc(longDate(d))}.</span> <span class="dim">Was je op stage? →</span> <span class="info">new log ${d}</span>`);
  const days = settings.lastBackup ? (Date.now() - settings.lastBackup) / 864e5 : Infinity;
  if (logCount() >= 3 && days > 7) print(`<span class="dim">💾 Tip: je laatste backup is ${settings.lastBackup ? Math.floor(days) + ' dagen' : 'nog nooit gemaakt'}. Typ</span> <span class="info">backup logs</span> <span class="dim">en bewaar het bestand in iCloud/OneDrive.</span>`);
}

// vraag de browser om je logs nooit automatisch op te ruimen
try { navigator.storage?.persist?.(); } catch { /* ok */ }

document.addEventListener('keydown', e => {
  if (document.activeElement !== input && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) input.focus();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().then(focusInput);
