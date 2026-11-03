'use strict';
/* StageLog Terminal — dagelijks stagelogboek in PowerShell-stijl.
   Alles wordt lokaal opgeslagen (localStorage). AI is optioneel en gratis
   via je eigen Google Gemini- of Groq-sleutel. */

const VERSION = '1.0.0';
const LS_LOGS = 'stagelog.logs';
const LS_SET = 'stagelog.settings';
const LS_HIST = 'stagelog.history';

const DEFAULT_MODELS = { gemini: 'gemini-2.5-flash', groq: 'llama-3.3-70b-versatile' };
const KEY_URLS = { gemini: 'https://aistudio.google.com/apikey', groq: 'https://console.groq.com/keys' };

// ── opslag ────────────────────────────────────────────────
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

let logs = load(LS_LOGS, {});
const storedSet = load(LS_SET, {});
let settings = {
  name: '', stage: '', provider: 'none',
  ...storedSet,
  keys: { gemini: '', groq: '', ...(storedSet.keys || {}) },
  models: { ...DEFAULT_MODELS, ...(storedSet.models || {}) },
};
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
  if (!logs[iso(d)]) d.setDate(d.getDate() - 1); // vandaag nog niet ingevuld = streak nog niet kapot
  let n = 0;
  for (let i = 0; i < 2000; i++) {
    const w = d.getDay();
    if (w === 0 || w === 6) { d.setDate(d.getDate() - 1); continue; } // weekends tellen niet mee
    if (logs[iso(d)]) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
const logCount = () => Object.keys(logs).length;
const sortedDates = () => Object.keys(logs).sort();

// ── DOM / output ──────────────────────────────────────────
const $ = s => document.querySelector(s);
const out = $('#output');
const input = $('#cmd');
const caret = $('#caret');
const promptbar = $('#promptbar');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  if (reduceMotion || text.length > 1500) { d.textContent = text; scrollDown(); return d; }
  for (let i = 0; i < text.length; i += 3) {
    d.textContent = text.slice(0, i + 3);
    if (i % 30 === 0) scrollDown();
    await sleep(6);
  }
  scrollDown();
  return d;
}

function spinner(label) {
  const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const d = print('', 'info');
  let i = 0;
  const t = setInterval(() => { d.textContent = `${frames[i++ % frames.length]} ${label}…`; }, 80);
  d.textContent = `${frames[0]} ${label}…`;
  return (doneText, cls = 'ok') => { clearInterval(t); if (doneText) { d.textContent = doneText; d.className = 'line ' + cls; } else d.remove(); };
}

// ── prompt ────────────────────────────────────────────────
let mode = 'cmd'; // 'cmd' | 'ask'
let busy = false;
let askHint = '';

function segmentsHtml(isBusy = false) {
  const name = settings.name || 'stagiair';
  const st = streak();
  const time = new Date().toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' });
  return `<div class="pl">
    <span class="seg s1">⚡ ${esc(name.toLowerCase())}</span>
    <span class="seg s2">~\\stage</span>
    <span class="seg s3">◷ dag ${logCount()}</span>
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

// ── vragen stellen (interview modus) ──────────────────────
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

async function askList(label) {
  const items = [];
  for (let i = 1; ; i++) {
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
  const names = [];
  for (const c of COMMANDS) { names.push(c.name); }
  const hits = names.filter(n => n.toLowerCase().startsWith(low));
  if (hits.length === 1) input.value = hits[0] + ' ';
  else if (hits.length > 1) {
    print(hits.map(h => `<span class="info">${esc(h)}</span>`).join('   '), '');
    let common = hits[0];
    for (const h of hits) while (!h.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
    if (common.length > v.length) input.value = common;
  }
}

function focusInput() {
  // op touch-apparaten niet bij elke klik het toetsenbord laten openspringen
  if (matchMedia('(pointer: coarse)').matches && mode === 'cmd') return;
  input.focus({ preventScroll: true });
}

out.addEventListener('click', e => {
  if (e.target.closest('a, button, .row')) return;
  if (String(getSelection())) return;
  input.focus({ preventScroll: true });
});

document.querySelector('#quickbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.key === 'enter') { submit(); return; }
  if (b.dataset.key === 'cancel') { cancel(); return; }
  if (b.dataset.run && !busy && mode === 'cmd') {
    input.value = b.dataset.run;
    submit();
  }
});

// ── commando parser ───────────────────────────────────────
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
    const sugg = COMMANDS.filter(x => x.name.toLowerCase().includes(cmd.toLowerCase().replace(/^(get|new|set|add)-?/, '')) ).slice(0, 3);
    print(`<span class="err">${esc(cmd)} : De term '${esc(cmd)}' wordt niet herkend als commando.</span>`);
    print(sugg.length
      ? `<span class="dim">Bedoelde je: </span>${sugg.map(s => `<span class="info">${s.name}</span>`).join(', ')}<span class="dim"> ?</span>`
      : `<span class="dim">Typ </span><span class="info">help</span><span class="dim"> voor alle commando's.</span>`);
    return;
  }
  busy = true; renderPrompt();
  try {
    await c.fn(args); // c.fn start synchroon (belangrijk voor file-picker op iPad)
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
    .replace(/\b(Probleem|Fout):/g, '<span class="hl-p">$1:</span>')
    .replace(/\b(Oplossing):/g, '<span class="hl-o">$1:</span>')
    .replace(/\b(Geleerd|Leerpunt):/g, '<span class="hl-g">$1:</span>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function logCardHtml(entry) {
  const list = arr => arr.length
    ? arr.map(t => `<li>${highlight(t)}</li>`).join('')
    : '<li class="dim">— niets ingevuld —</li>';
  return `<div class="logcard">
    <div class="lc-head"><span class="lc-date">📅 ${esc(capDate(entry.date))}</span><span class="lc-id">${entry.date}</span></div>
    <div class="lc-title prod">▸ PRODUCTIEF</div><ul>${list(entry.productief || [])}</ul>
    <div class="lc-title les">▸ FOUTEN / LEERMOMENTEN</div><ul>${list(entry.leermomenten || [])}</ul>
  </div>`;
}
const showLog = entry => print(logCardHtml(entry));

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
    } else if (p === 'groq') {
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
    if (res.status === 400 && /api key/i.test(msg) || res.status === 401 || res.status === 403) throw new UserError('API-sleutel ongeldig. Typ Set-Config om hem opnieuw in te stellen.');
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

const stageContext = () => settings.stage ? `Context over de stage: ${settings.stage}.` : '';

const SYS_REVIEW = () => `Je bent een strenge maar behulpzame stagebegeleider die een dagelijks STAGELOGBOEK controleert.
Een logboek is GEEN dagboek: het gaat over uitgevoerde taken, wat de stagiair geleerd heeft, wat hij of zij nu kan, en problemen met hun oplossing. Gevoelens, sfeer, eten, pauzes en collega-gesprekken die niets met het werk te maken hebben horen er niet in.
${stageContext()}
Je krijgt ruwe notities als JSON met "productief" (taken) en "leermomenten" (fouten/leermomenten).
Antwoord ALLEEN met JSON in dit formaat:
{"vragen": ["..."], "dagboek": ["..."]}
- "vragen": maximaal 3 korte, concrete vervolgvragen in het Nederlands, ALLEEN over punten die te vaag zijn (bv. welke tool/taal, wat was precies de fout, hoe heb je het opgelost, wat heb je ervan geleerd). Lege lijst als alles al concreet genoeg is. Spreek de stagiair aan met "je".
- "dagboek": letterlijke zinnen uit de notities die dagboek-achtig zijn. Lege lijst als er geen zijn.`;

const SYS_POLISH = () => `Je herschrijft ruwe notities tot een professioneel dagelijks STAGELOGBOEK in het Nederlands.
${stageContext()}
Regels:
- Ik-vorm, verleden tijd, kort en concreet. Behoud vaktermen, namen van tools, talen en technologieën.
- Verzin NIETS dat niet in de notities of in "extraInfo" staat.
- Laat dagboek-achtige zinnen weg (gevoelens, sfeer, eten, pauzes).
- "productief": één bullet per uitgevoerde taak, beginnend met een werkwoord in de verleden tijd (bv. "Opgezet", "Geschreven", "Getest"…). Voeg samen wat dubbel is.
- "leermomenten": één bullet per fout of leermoment, waar mogelijk in de vorm "Probleem: … → Oplossing: … → Geleerd: …". Laat delen weg die echt onbekend zijn. Als een taak eigenlijk een leermoment bevat, zet het leermoment dan bij "leermomenten".
- Gebruik geen markdown behalve backticks rond code, commando's of bestandsnamen.
Antwoord ALLEEN met JSON: {"productief": ["..."], "leermomenten": ["..."]}`;

const strArr = a => Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [];

async function aiPolish(date, raw) {
  let stop = spinner('AI leest je notities');
  let review;
  try { review = await aiCall(SYS_REVIEW(), JSON.stringify(raw)); stop(); }
  catch (e) { stop('✖ ' + e.message, 'err'); return null; }

  const diary = strArr(review.dagboek);
  if (diary.length) {
    say('⚠ Dagboek-detector — dit hoort niet echt in een logboek:', 'warn');
    diary.forEach(z => say(`   “${z}”`, 'warn'));
  }
  const extraInfo = [];
  const vragen = strArr(review.vragen).slice(0, 3);
  if (vragen.length) {
    print('<span class="section ai-sec">AI VERVOLGVRAGEN</span>');
    say('Even doorvragen zodat je log concreter wordt (leeg laten = overslaan):', 'dim');
    for (const q of vragen) {
      const a = (await ask(`<span class="ai">${esc(q)}</span>`, { hint: 'antwoord' })).trim();
      if (a) extraInfo.push({ vraag: q, antwoord: a });
    }
  }

  stop = spinner('AI schrijft je logboek');
  try {
    const res = await aiCall(SYS_POLISH(), JSON.stringify({ datum: date, ...raw, extraInfo }));
    const r = { productief: strArr(res.productief), leermomenten: strArr(res.leermomenten) };
    if (!r.productief.length && !r.leermomenten.length) throw new UserError('AI gaf een lege log terug.');
    stop('✔ Klaar. Zo ziet je log eruit:', 'ok');
    return r;
  } catch (e) { stop('✖ ' + e.message, 'err'); return null; }
}

// ── commando's ────────────────────────────────────────────
async function cmdNewLog(a) {
  const date = parseDate(a.named.date ?? a._[0]);
  if (!date) throw new UserError('Ongeldige datum. Gebruik bv. 2026-11-03, 3-11, vandaag of gisteren.');
  print(`<span class="section">◆ NEW-LOG</span> <span class="b">${esc(capDate(date))}</span>`);

  let base = { productief: [], leermomenten: [] };
  if (logs[date]) {
    say('Er bestaat al een log voor deze dag:', 'dim');
    showLog(logs[date]);
    const c = (await ask('[A]anvullen, [O]pnieuw beginnen of [S]toppen?', { prose: false })).trim().toLowerCase();
    if (c.startsWith('a')) base = { productief: [...logs[date].productief], leermomenten: [...logs[date].leermomenten] };
    else if (!c.startsWith('o')) { say('Niets veranderd.', 'dim'); return; }
  }

  print('<span class="section">PRODUCTIEF</span>');
  say('Wat heb je gedaan? Eén taak per regel. Lege regel (⏎) = klaar.', 'dim');
  const tasks = await askList('taak');

  print('<span class="section les">FOUTEN / LEERMOMENTEN</span>');
  say('Waar liep je tegenaan? Wat ging fout, hoe loste je het op, wat heb je geleerd? Lege regel = klaar.', 'dim');
  const lessons = await askList('leermoment');

  const raw = { productief: [...base.productief, ...tasks], leermomenten: [...base.leermomenten, ...lessons] };
  if (!raw.productief.length && !raw.leermomenten.length) { say('Niets ingevuld, dus niets opgeslagen.', 'warn'); return; }

  let final = raw;
  if (aiReady()) {
    if (await yes('🤖 Mag de AI meekijken, doorvragen en het netjes formuleren? [J/n]')) {
      final = (await aiPolish(date, raw)) || raw;
    }
  } else {
    say('Tip: koppel gratis AI met Set-Config, dan wordt je log automatisch netjes geformuleerd.', 'dim');
  }

  showLog({ date, ...final });
  let choice = 'j';
  if (final !== raw) {
    choice = (await ask('Opslaan? [J]a  /  [R]uwe versie (zonder AI)  /  [N]ee', { prose: false })).trim().toLowerCase() || 'j';
  } else if (!(await yes('Opslaan? [J/n]'))) choice = 'n';

  if (choice.startsWith('n')) { say('Niet opgeslagen.', 'warn'); return; }
  const chosen = choice.startsWith('r') ? raw : final;
  logs[date] = { date, productief: chosen.productief, leermomenten: chosen.leermomenten, raw, updated: Date.now() };
  saveLogs();
  const st = streak();
  say(`✔ Log opgeslagen voor ${longDate(date)}.${st > 1 ? `  🔥 ${st} werkdagen op rij!` : ''}`, 'ok');
}

function quickAdd(kind) {
  return async a => {
    let text = a._.join(' ').trim();
    if (!text) {
      text = (await ask(kind === 'productief' ? 'Welke taak wil je toevoegen?' : 'Welk leermoment / welke fout wil je toevoegen?', { hint: kind === 'productief' ? 'taak' : 'leermoment' })).trim();
      if (!text) { say('Niets toegevoegd.', 'dim'); return; }
    }
    const date = parseDate(a.named.date);
    if (!date) throw new UserError('Ongeldige datum.');
    const e = logs[date] || { date, productief: [], leermomenten: [], raw: { productief: [], leermomenten: [] } };
    e.productief = e.productief || []; e.leermomenten = e.leermomenten || [];
    e[kind].push(text);
    e.raw = e.raw || { productief: [], leermomenten: [] };
    e.raw[kind] = [...(e.raw[kind] || []), text];
    e.updated = Date.now();
    logs[date] = e;
    saveLogs();
    say(`✔ Toegevoegd aan ${kind === 'productief' ? 'Productief' : 'Fouten / leermomenten'} (${date === today() ? 'vandaag' : date}). Totaal: ${e.productief.length} taken, ${e.leermomenten.length} leermomenten.`, 'ok');
  };
}

async function cmdGetLog(a) {
  const date = parseDate(a.named.date ?? a._[0]);
  if (!date) throw new UserError('Ongeldige datum.');
  if (!logs[date]) {
    say(`Geen log gevonden voor ${longDate(date)}.`, 'warn');
    if (date === today()) print('<span class="dim">Start er een met </span><span class="info">New-Log</span><span class="dim"> of voeg snel iets toe met </span><span class="info">Add-Task "…"</span>');
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
  t.innerHTML = `<span class="th">Datum</span><span class="th wd">Dag</span><span class="th"></span><span class="th num">Taken</span><span class="th num">Leerm.</span>`;
  for (const d of dates) {
    const e = logs[d];
    const row = document.createElement('div');
    row.className = 'row';
    row.title = 'Klik om te openen';
    const prev = (e.productief[0] || e.leermomenten[0] || '').slice(0, 60);
    row.innerHTML = `<span class="info">${d}</span><span class="dim wd">${esc(shortDay(d))}</span><span class="dim">${esc(prev)}${prev.length >= 60 ? '…' : ''}</span><span class="num">${e.productief.length}</span><span class="num mag">${e.leermomenten.length}</span>`;
    row.addEventListener('click', () => { if (!busy && mode === 'cmd') { input.value = `Get-Log ${d}`; submit(); } });
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
  const c = (await ask(`Typ <b>verwijder</b> om deze log definitief te wissen:`, { prose: false })).trim().toLowerCase();
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
    // ISO-achtige week: maandag t/m zondag van de week "n weken geleden" (0 = deze week)
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
  const data = dates.map(d => ({ datum: d, productief: logs[d].productief, leermomenten: logs[d].leermomenten }));
  const stop = spinner(`AI vat ${dates.length} dag(en) samen`);
  let text;
  try {
    text = await aiCall(`Je maakt een samenvatting van een stagelogboek in het Nederlands, in de ik-vorm, voor een stageverslag. ${stageContext()}
Gebruik deze kopjes (gewone tekst, geen markdown-sterretjes of #):
OVERZICHT — 2-3 zinnen over waar ik deze periode aan gewerkt heb.
BELANGRIJKSTE TAKEN — opsomming met "- ".
WAT IK GELEERD HEB / WAT IK NU KAN — opsomming met "- ", geformuleerd als competenties.
TERUGKERENDE PROBLEMEN — opsomming met "- " (laat weg als er geen zijn).
VOLGENDE STAPPEN / GROEIPUNTEN — opsomming met "- ".
Verzin niets dat niet in de logs staat.`, JSON.stringify(data), { json: false });
    stop(`✔ Samenvatting ${dates[0]} → ${dates[dates.length - 1]}`, 'ok');
  } catch (e) { stop('✖ ' + e.message, 'err'); return; }
  await typeOut(text, 'ai-out');
  lastSummary = text;
  print('<span class="dim">Kopiëren: </span><a href="#" id="cp-sum">📋 kopieer samenvatting</a>');
  const link = document.getElementById('cp-sum'); link.removeAttribute('id');
  link.addEventListener('click', async e => {
    e.preventDefault();
    try { await navigator.clipboard.writeText(text); link.textContent = '✔ gekopieerd'; } catch { link.textContent = 'kopiëren lukte niet'; }
  });
}
let lastSummary = '';

// ── export ────────────────────────────────────────────────
function buildMarkdown(dates) {
  const lines = [`# Stagelogboek${settings.name ? ' — ' + settings.name : ''}`, ''];
  if (settings.stage) lines.push(`_${settings.stage}_`, '');
  for (const d of dates) {
    const e = logs[d];
    const cap = longDate(d).replace(/^./, c => c.toUpperCase());
    lines.push('---', '', `## ${cap}`, '', '**Productief**', '');
    (e.productief.length ? e.productief : ['—']).forEach(t => lines.push(`- ${t}`));
    lines.push('', '**Fouten / leermomenten**', '');
    (e.leermomenten.length ? e.leermomenten : ['—']).forEach(t => lines.push(`- ${t}`));
    lines.push('');
  }
  return lines.join('\n');
}

function buildDocHtml(dates) {
  const li = arr => (arr.length ? arr : ['—']).map(t => `<li>${esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\b(Probleem|Oplossing|Geleerd):/g, '<b>$1:</b>')}</li>`).join('');
  const body = dates.map(d => {
    const e = logs[d];
    return `<div class="day"><h2>${esc(longDate(d).replace(/^./, c => c.toUpperCase()))}</h2>
      <h3>Productief</h3><ul>${li(e.productief)}</ul>
      <h3>Fouten / leermomenten</h3><ul>${li(e.leermomenten)}</ul></div>`;
  }).join('');
  return `<h1>Stagelogboek${settings.name ? ' — ' + esc(settings.name) : ''}</h1>
    ${settings.stage ? `<p class="sub">${esc(settings.stage)}</p>` : ''}
    <p class="sub">Periode: ${dates[0]} t/m ${dates[dates.length - 1]} · ${dates.length} dag(en)</p>${body}`;
}
const DOC_CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111;line-height:1.4}
h1{font-size:20pt;margin:0 0 4pt;color:#1e3a8a}.sub{color:#555;margin:0 0 4pt}
.day{page-break-inside:avoid;border-top:1px solid #ccc;padding-top:8pt;margin-top:12pt}
h2{font-size:13pt;margin:0 0 4pt;color:#111}h3{font-size:11pt;margin:8pt 0 2pt;color:#1e3a8a}
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
  } else if (fmt === 'word' || fmt === 'doc' || fmt === 'docx') {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Stagelogboek</title><style>${DOC_CSS}</style></head><body>${buildDocHtml(dates)}</body></html>`;
    download(`stagelogboek-${stamp}.doc`, '﻿' + html, 'application/msword');
    say('✔ Word-bestand gedownload (opent in Word, Pages en Google Docs).', 'ok');
  } else if (fmt === 'pdf') {
    const area = document.getElementById('print-area');
    area.innerHTML = `<style>${DOC_CSS.replace(/body\{/, '#print-area{')}</style>${buildDocHtml(dates)}`;
    say('Printvenster opent… kies "Opslaan als PDF" (iPad: Delen → Opslaan in Bestanden).', 'info');
    await sleep(200);
    window.print();
  } else throw new UserError('Onbekend formaat. Kies pdf, word of md.');
}

async function cmdBackup() {
  const data = { app: 'StageLog', version: VERSION, exported: new Date().toISOString(), settings: { name: settings.name, stage: settings.stage }, logs };
  download(`stagelog-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  say(`✔ Backup van ${logCount()} log(s) gedownload. Bewaar dit bestand goed (bv. in iCloud/OneDrive).`, 'ok');
  say('Je API-sleutel zit er bewust NIET in.', 'dim');
}

function cmdRestore() {
  const fileEl = document.getElementById('file');
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
          logs[d] = { date: d, productief: strArr(e.productief), leermomenten: strArr(e.leermomenten), raw: e.raw, updated: e.updated || Date.now() };
          n++;
        }
        if (data.settings?.name && !settings.name) settings.name = data.settings.name;
        if (data.settings?.stage && !settings.stage) settings.stage = data.settings.stage;
        saveSettings(); saveLogs();
        say(`✔ ${n} log(s) teruggezet. Totaal nu: ${logCount()}.`, 'ok');
      } catch { say('✖ Dit bestand kon niet gelezen worden.', 'err'); }
      resolve();
    };
    fileEl.addEventListener('change', onChange);
    // geannuleerd kiezen geeft geen change-event: na focus terug stoppen we met wachten
    window.addEventListener('focus', () => setTimeout(() => { if (!fileEl.files.length) { fileEl.removeEventListener('change', onChange); resolve(); } }, 800), { once: true });
    fileEl.click();
  });
}

async function cmdConfig(a) {
  if (typeof a.named.model === 'string') {
    if (settings.provider === 'none') throw new UserError('Kies eerst een AI-provider met Set-Config.');
    settings.models[settings.provider] = a.named.model; saveSettings();
    say(`✔ Model voor ${settings.provider} is nu ${a.named.model}.`, 'ok');
    return;
  }
  print('<span class="section">⚙ SET-CONFIG</span>');
  say('Leeg laten = huidige waarde houden.', 'dim');

  const name = (await ask(`Hoe heet je?${settings.name ? ` <span class="dim">(nu: ${esc(settings.name)})</span>` : ''}`, { hint: 'naam' })).trim();
  if (name) settings.name = name;

  const stage = (await ask(`Beschrijf je stage in één zin, zodat de AI je beter snapt.${settings.stage ? `<br><span class="dim">(nu: ${esc(settings.stage)})</span>` : '<br><span class="dim">bv. "Webdeveloper bij een marketingbureau, ik werk met React en Laravel"</span>'}`, { hint: 'stage' })).trim();
  if (stage) settings.stage = stage;

  print(`Welke gratis AI wil je gebruiken? <span class="dim">(nu: ${settings.provider})</span>
  <span class="info">[1]</span> Google Gemini  <span class="dim">— aanrader, ruime gratis limiet</span>
  <span class="info">[2]</span> Groq (Llama)    <span class="dim">— supersnel, ook gratis</span>
  <span class="info">[3]</span> Geen AI         <span class="dim">— alles werkt, alleen zonder slimme hulp</span>`, 'q');
  const p = (await ask('', { hint: 'keuze', prose: false })).trim().toLowerCase();
  if (p === '1' || p.startsWith('gem')) settings.provider = 'gemini';
  else if (p === '2' || p.startsWith('gr')) settings.provider = 'groq';
  else if (p === '3' || p.startsWith('geen') || p === 'none') settings.provider = 'none';
  saveSettings();

  if (settings.provider !== 'none') {
    const pr = settings.provider;
    const has = !!settings.keys[pr];
    print(`Gratis sleutel aanmaken: <a href="${KEY_URLS[pr]}" target="_blank" rel="noopener">${KEY_URLS[pr]}</a>
<span class="dim">Log in → "Create API key" → kopieer en plak hier. De sleutel blijft alleen op dit apparaat.</span>`, '');
    const key = (await ask(`Plak je ${pr === 'gemini' ? 'Gemini' : 'Groq'} API-sleutel${has ? ' <span class="dim">(leeg = bestaande houden)</span>' : ''}:`, { hint: 'sleutel', secret: true })).trim();
    if (key) settings.keys[pr] = key;
    saveSettings();
    if (settings.keys[pr]) await cmdTestAI();
    else say('Geen sleutel ingesteld, dus AI staat nog uit.', 'warn');
  }
  say('✔ Instellingen opgeslagen.', 'ok');
}

async function cmdTestAI() {
  if (!aiReady()) throw new UserError('Geen AI ingesteld. Typ Set-Config.');
  const stop = spinner(`Verbinding testen met ${settings.provider} (${settings.models[settings.provider]})`);
  try {
    const r = await aiCall('Antwoord alleen met JSON: {"status":"online","groet":"<korte stoere hacker-groet in het Nederlands, max 8 woorden>"}', 'ping', { temperature: 0.9 });
    stop(`✔ AI-uplink ONLINE — ${r.groet || 'verbonden'}`, 'ok');
  } catch (e) { stop('✖ ' + e.message, 'err'); }
}

async function cmdStats() {
  const dates = sortedDates();
  const tasks = dates.reduce((n, d) => n + logs[d].productief.length, 0);
  const lessons = dates.reduce((n, d) => n + logs[d].leermomenten.length, 0);
  const st = streak();
  const bar = (n, max) => { const w = 24, f = Math.round(Math.min(1, n / Math.max(1, max)) * w); return `<span class="bar">${'█'.repeat(f)}<span class="rest">${'░'.repeat(w - f)}</span></span>`; };
  const max = Math.max(tasks, lessons, 1);
  print(`<span class="section">◆ GET-STATS</span>
<span class="dim">Gebruiker    </span> <b>${esc(settings.name || '—')}</b>
<span class="dim">Stage        </span> ${esc(settings.stage || '—')}
<span class="dim">Logs         </span> <b>${dates.length}</b>${dates.length ? ` <span class="dim">(${dates[0]} → ${dates[dates.length - 1]})</span>` : ''}
<span class="dim">Streak       </span> <b>${st ? '🔥 ' + st : '0'}</b> <span class="dim">werkdagen op rij</span>
<span class="dim">Taken        </span> ${bar(tasks, max)} <b>${tasks}</b>
<span class="dim">Leermomenten </span> ${bar(lessons, max)} <b>${lessons}</b>
<span class="dim">AI           </span> ${aiReady() ? `<span class="ok">● ${settings.provider}</span> <span class="dim">${esc(settings.models[settings.provider])}</span>` : '<span class="warn">○ uit</span> <span class="dim">(Set-Config)</span>'}
<span class="dim">Versie       </span> v${VERSION}`);
}

function cmdHelp() {
  const rows = COMMANDS.filter(c => !c.hidden).map(c => `<span class="cmd">${c.name}</span><span class="desc">${esc(c.desc)}${c.alias.length ? ` <span class="al">[${c.alias.join(', ')}]</span>` : ''}${c.usage ? `<br><span class="dim">  ${esc(c.usage)}</span>` : ''}</span>`).join('');
  print(`<span class="section">◆ GET-HELP</span>`);
  print(`<div class="help-grid">${rows}</div>`);
  say('Tab = aanvullen · ↑↓ = vorige commando\'s · Ctrl+C = afbreken · Ctrl+L = scherm leeg', 'dim');
  say('Datums: vandaag, gisteren, 3-11, 2026-11-03', 'dim');
}

const COMMANDS = [
  { name: 'New-Log', alias: ['nl', 'new', 'log'], desc: 'Schrijf je log van vandaag (met AI-interview)', usage: 'New-Log  |  New-Log -Date gisteren', fn: cmdNewLog },
  { name: 'Add-Task', alias: ['task', 'taak', 'at'], desc: 'Snel een taak toevoegen, ook tussendoor', usage: 'Add-Task "API endpoint voor login gemaakt"', fn: quickAdd('productief') },
  { name: 'Add-Lesson', alias: ['les', 'fout', 'al'], desc: 'Snel een fout/leermoment toevoegen', usage: 'Add-Lesson "CORS-fout opgelost met proxy"', fn: quickAdd('leermomenten') },
  { name: 'Get-Log', alias: ['gl', 'show', 'cat'], desc: 'Bekijk de log van een dag', usage: 'Get-Log  |  Get-Log gisteren  |  Get-Log 3-11', fn: cmdGetLog },
  { name: 'Get-Logs', alias: ['ls', 'dir', 'list'], desc: 'Overzicht van al je logs', fn: cmdGetLogs },
  { name: 'Get-Summary', alias: ['sum', 'samenvatting'], desc: 'AI-samenvatting van een periode (voor je verslag)', usage: 'Get-Summary  |  Get-Summary -Week  |  Get-Summary -Days 30', fn: cmdSummary },
  { name: 'Export-Verslag', alias: ['export'], desc: 'Exporteer naar PDF, Word of Markdown', usage: 'Export-Verslag -Format pdf  |  -Week 1  |  -From 1-11 -To 7-11', fn: cmdExport },
  { name: 'Remove-Log', alias: ['rm', 'del'], desc: 'Verwijder een log', usage: 'Remove-Log 2026-11-03', fn: cmdRemoveLog },
  { name: 'Backup-Logs', alias: ['backup'], desc: 'Download een backup van alles (.json)', fn: cmdBackup },
  { name: 'Restore-Logs', alias: ['restore', 'import'], desc: 'Zet een backup terug (ook om pc ↔ iPad over te zetten)', fn: cmdRestore },
  { name: 'Set-Config', alias: ['setup', 'config'], desc: 'Naam, stage-info en gratis AI instellen', usage: 'Set-Config  |  Set-Config -Model gemini-2.5-flash', fn: cmdConfig },
  { name: 'Test-AI', alias: ['ping'], desc: 'Test de AI-verbinding', fn: cmdTestAI },
  { name: 'Get-Stats', alias: ['stats', 'whoami'], desc: 'Je statistieken en streak', fn: cmdStats },
  { name: 'Clear-Host', alias: ['cls', 'clear'], desc: 'Scherm leegmaken', fn: async () => { out.innerHTML = ''; } },
  { name: 'Get-Help', alias: ['help', '?', 'man'], desc: 'Deze lijst', fn: async () => cmdHelp() },
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
  renderPrompt();
  const pre = document.createElement('pre');
  pre.className = 'banner';
  pre.textContent = bannerText('STAGE LOG');
  out.appendChild(pre);

  const fast = reduceMotion || sessionStorage.getItem('booted');
  const steps = [
    ['ok', `Initializing StageLog kernel v${VERSION}`],
    ['ok', `Mounting logbook storage ............ ${logCount()} entries`],
    ['ok', 'Loading modules: Logbook, Export, Streak, DiaryDetector'],
    aiReady() ? ['ok', `AI uplink: ${settings.provider} → ${settings.models[settings.provider]}`] : ['wn', 'AI uplink: niet geconfigureerd (Set-Config)'],
    ['ok', 'Decrypting yesterday\'s mistakes ...... done'],
  ];
  for (const [t, msg] of steps) {
    print(`<span class="tag ${t}">[${t === 'ok' ? ' OK ' : 'WARN'}]</span> <span class="dim">${esc(msg)}</span>`, 'boot');
    if (!fast) await sleep(110 + Math.random() * 120);
  }
  try { sessionStorage.setItem('booted', '1'); } catch { /* ok */ }
  print('');

  const name = settings.name ? `, ${esc(settings.name)}` : '';
  const done = !!logs[today()];
  print(`Welkom terug${name}. <span class="dim">Vandaag is</span> <b>${esc(longDate(today()))}</b>.`);
  if (done) print(`<span class="ok">✔ Je log van vandaag staat er al.</span> <span class="dim">Bekijk met</span> <span class="info">Get-Log</span><span class="dim">, aanvullen met</span> <span class="info">New-Log</span>`);
  else print(`<span class="warn">● Nog geen log voor vandaag.</span> <span class="dim">Typ</span> <span class="info">New-Log</span> <span class="dim">om te beginnen, of</span> <span class="info">help</span> <span class="dim">voor alle commando's.</span>`);

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
