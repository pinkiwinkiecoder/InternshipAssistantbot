'use strict';
/* ═══════════════════════════════════════════════════════════
   StageLog extra's: foto's (IndexedDB), agenda-overzicht en
   "kopieer" (nette tekst om in OnStage / mail / Teams te plakken).
   Wordt geladen ná app.js en gebruikt diens helpers.
   ═══════════════════════════════════════════════════════════ */

// ── foto-opslag ───────────────────────────────────────────
const PhotoDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('stagelog', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('photos', mode);
      const req = fn(t.objectStore('photos'));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    put: p => tx('readwrite', st => st.put(p)),
    get: id => tx('readonly', st => st.get(id)),
    del: id => tx('readwrite', st => st.delete(id)),
    all: () => tx('readonly', st => st.getAll()),
  };
})();

async function compressImage(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Dit bestand kan ik niet als foto openen.')); i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { data: c.toDataURL('image/jpeg', 0.82), w, h };
  } finally { URL.revokeObjectURL(url); }
}

const newPhotoId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// "foto [datum]" — opent meteen de camera/fotobibliotheek (moet binnen de klik/Enter gebeuren)
function cmdFoto(a) {
  const given = a.named.date ?? a._.join(' ');
  const date = given && given !== true ? parseDate(given) : today();
  if (!date) throw new UserError('Ongeldige datum. Bv. foto gisteren of foto 3-11');
  const el = $('#photo-file');
  el.value = '';
  print(`<span class="section">📷 FOTO'S</span> <span class="b">${esc(capDate(date))}</span>`);
  say('Kies foto\'s of maak er een met je camera (rig, patchlijst, lichttafel, focus…)', 'dim');
  const picked = new Promise(resolve => {
    const on = () => { el.removeEventListener('change', on); resolve([...el.files]); };
    el.addEventListener('change', on);
    addEventListener('focus', () => setTimeout(() => { if (!el.files.length) { el.removeEventListener('change', on); resolve([]); } }, 1200), { once: true });
  });
  el.click();
  return (async () => {
    const files = await picked;
    if (!files.length) { say('Geen foto gekozen.', 'dim'); return; }
    const stop = spinner(`${files.length} foto${files.length > 1 ? "'s" : ''} verkleinen en opslaan`);
    const ids = [];
    try {
      for (const f of files) {
        const { data, w, h } = await compressImage(f);
        const id = newPhotoId();
        await PhotoDB.put({ id, date, data, w, h, caption: '', created: Date.now() });
        ids.push(id);
      }
      stop(`✔ ${ids.length} foto${ids.length > 1 ? "'s" : ''} opgeslagen.`, 'ok');
    } catch (e) { stop('✖ ' + (e.message || e), 'err'); if (!ids.length) return; }
    const e = logs[date] || normalize({}, date);
    e.fotos = [...(e.fotos || []), ...ids];
    e.updated = Date.now();
    logs[date] = e;
    saveLogs();
    for (let i = 0; i < ids.length; i++) {
      const cap = (await ask(`Bijschrift voor foto ${i + 1}/${ids.length}? <span class="dim">(bv. "Rig trek 4 na het ophangen" — leeg = geen)</span>`, { hint: 'bijschrift' })).trim();
      if (cap && cap !== '-') { const ph = await PhotoDB.get(ids[i]); ph.caption = cap; await PhotoDB.put(ph); }
    }
    showLog(logs[date]);
    fireGo(`📷 ${ids.length} FOTO${ids.length > 1 ? "'S" : ''}`);
  })();
}

async function deletePhotosOf(date) {
  for (const id of logs[date]?.fotos || []) { try { await PhotoDB.del(id); } catch { /* ok */ } }
}

async function photosFor(date) {
  const out = [];
  for (const id of logs[date]?.fotos || []) { try { const p = await PhotoDB.get(id); if (p) out.push(p); } catch { /* ok */ } }
  return out;
}

// miniaturen in een log-kaart laden
async function hydratePhotos(rootEl) {
  for (const box of rootEl.querySelectorAll('.lc-photos[data-date]')) {
    const date = box.dataset.date;
    const ps = await photosFor(date);
    box.innerHTML = ps.map(p => `<button class="thumb" data-id="${p.id}" title="${esc(p.caption || 'Foto')}"><img src="${p.data}" alt="${esc(p.caption || 'Foto')}">${p.caption ? `<span>${esc(p.caption)}</span>` : ''}</button>`).join('');
    box.onclick = e => { const t = e.target.closest('.thumb'); if (t) openLightbox(date, t.dataset.id); };
  }
}

function openLightbox(date, id) {
  const lb = $('#lightbox');
  const ids = logs[date]?.fotos || [];
  let idx = Math.max(0, ids.indexOf(id));
  const show = async () => {
    const p = await PhotoDB.get(ids[idx]);
    if (!p) return close();
    lb.innerHTML = `<div class="lb-panel">
      <img src="${p.data}" alt="">
      <div class="lb-bar"><span class="lb-cap">${esc(p.caption || '')}</span><span class="dim">${idx + 1}/${ids.length} · ${esc(capDate(date))}</span></div>
      <div class="lb-actions">
        ${ids.length > 1 ? '<button data-a="prev">‹ vorige</button><button data-a="next">volgende ›</button>' : ''}
        <button data-a="cap">✎ bijschrift</button><button data-a="del" class="danger">🗑 verwijderen</button><button data-a="close">✕ sluiten</button>
      </div></div>`;
  };
  const close = () => { lb.hidden = true; lb.innerHTML = ''; lb.onclick = null; removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') { idx = (idx + 1) % ids.length; show(); } if (e.key === 'ArrowLeft') { idx = (idx - 1 + ids.length) % ids.length; show(); } };
  lb.onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) { if (e.target === lb) close(); return; }
    const act = b.dataset.a;
    if (act === 'close') close();
    if (act === 'next') { idx = (idx + 1) % ids.length; show(); }
    if (act === 'prev') { idx = (idx - 1 + ids.length) % ids.length; show(); }
    if (act === 'cap') {
      const p = await PhotoDB.get(ids[idx]);
      const v = prompt('Bijschrift:', p.caption || '');
      if (v !== null) { p.caption = v.trim(); await PhotoDB.put(p); show(); refreshPhotoBoxes(date); }
    }
    if (act === 'del' && confirm('Deze foto verwijderen?')) {
      const gone = ids.splice(idx, 1)[0];
      await PhotoDB.del(gone);
      logs[date].fotos = ids; logs[date].updated = Date.now(); saveLogs();
      refreshPhotoBoxes(date);
      if (!ids.length) close(); else { idx = Math.min(idx, ids.length - 1); show(); }
    }
  };
  addEventListener('keydown', key);
  lb.hidden = false;
  show();
}
const refreshPhotoBoxes = date => document.querySelectorAll(`.lc-photos[data-date="${date}"]`).forEach(b => hydratePhotos(b.parentElement));

// ── kopieer (voor OnStage, mail, Teams…) ─────────────────
function dayText(d) {
  const e = logs[d];
  const L = [`📅 ${capDate(d)}`];
  const mins = parseHours(e.uren);
  if (e.productie) L.push(`Productie: ${e.productie}`);
  if (e.locatie) L.push(`Locatie: ${e.locatie}`);
  if (e.uren) L.push(`Werkuren: ${e.uren}${mins != null ? ` (${fmtMins(mins)})` : ''}`);
  for (const f of LIST_FIELDS) if (e[f.key].length) L.push('', `${f.short}:`, ...e[f.key].map(t => `• ${t.replace(/`/g, '')}`));
  if (e.fotos?.length) L.push('', `(${e.fotos.length} foto${e.fotos.length > 1 ? "'s" : ''} in de Word-export)`);
  return L.join('\n');
}

async function cmdKopieer(a) {
  let dates;
  if (a.named.week || a.named.days || a.named.from || a.named.month || a.named.all) dates = rangeFromArgs(a);
  else {
    const g = a._.join(' ');
    const d = g ? parseDate(g) : await pickDate('Welke dag wil je kopiëren? (om in OnStage, een mail of Teams te plakken)', { onlyLogged: true });
    if (!d || !logs[d]) throw new UserError('Geen log voor die dag.');
    dates = [d];
  }
  if (!dates.length) throw new UserError('Geen logs in die periode.');
  const text = dates.map(dayText).join('\n\n────────────────────\n\n');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* valt terug op tekstvak */ }
  const box = print(`<div class="copybox"><div class="cb-head">📋 ${dates.length} dag${dates.length > 1 ? 'en' : ''} · ${text.length} tekens <button class="cb-btn">${ok ? '✔ gekopieerd — nog eens' : '📋 kopieer'}</button></div><textarea readonly rows="${Math.min(14, text.split('\n').length + 1)}">${esc(text)}</textarea></div>`);
  const ta = box.querySelector('textarea');
  box.querySelector('.cb-btn').onclick = async ev => {
    try { await navigator.clipboard.writeText(text); ev.target.textContent = '✔ gekopieerd'; }
    catch { ta.focus(); ta.select(); document.execCommand?.('copy'); ev.target.textContent = 'geselecteerd — kopieer met Ctrl+C'; }
  };
  if (ok) say('✔ Gekopieerd! Ga naar OnStage (of je mail/Teams) en plak met Ctrl+V — op de iPad: lang drukken → Plak.', 'ok glow');
  else { ta.focus(); ta.select(); say('Tekst staat klaar en is geselecteerd: kopieer met Ctrl+C (iPad: tik → Kopieer).', 'warn'); }
}

// ── agenda ────────────────────────────────────────────────
const agenda = { mode: 'maand', y: 0, m: 0, sel: null };
const PROD_COLORS = ['var(--a1)', 'var(--a4)', 'var(--yellow)', 'var(--green)', 'var(--a2)', 'var(--orange)', 'var(--a3)'];
const prodColor = name => { let h = 0; for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0; return name ? PROD_COLORS[h % PROD_COLORS.length] : 'var(--dim)'; };
const isoWeek = s => {
  const d = fromIso(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7);
};
const mondayOf = s => { let d = s; while (fromIso(d).getDay() !== 1) d = addDays(d, -1); return d; };

function cmdAgenda(a) {
  const t = fromIso(today());
  const want = a._.join(' ').toLowerCase();
  agenda.mode = /lijst|list|week/.test(want) ? 'lijst' : 'maand';
  const d = want && parseDate(want.replace(/lijst|list|week/g, '').trim() || 'x');
  const base = d ? fromIso(d) : t;
  agenda.y = base.getFullYear(); agenda.m = base.getMonth();
  agenda.sel = d && logs[d] ? d : (logs[today()] ? today() : null);
  $('#agenda').hidden = false;
  document.body.classList.add('overlay-open');
  renderAgenda();
  say('📅 Agenda geopend. Sluit met ✕ of Esc.', 'dim');
}

function closeAgenda() { $('#agenda').hidden = true; document.body.classList.remove('overlay-open'); }

function renderAgenda() {
  const ov = $('#agenda');
  const { y, m, mode, sel } = agenda;
  const key = `${y}-${pad(m + 1)}`;
  const t = today();
  const all = sortedDates();
  const inMonth = all.filter(d => d.startsWith(key));
  const mins = ds => ds.reduce((n, d) => n + (parseHours(logs[d].uren) || 0), 0);
  const totals = mode === 'maand' ? inMonth : all;

  let body = '';
  if (mode === 'maand') {
    const first = (new Date(y, m, 1).getDay() + 6) % 7;
    const n = new Date(y, m + 1, 0).getDate();
    body = `<div class="ag-grid">${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(w => `<span class="ag-wd">${w}</span>`).join('')}`;
    for (let i = 0; i < first; i++) body += '<span class="ag-empty"></span>';
    for (let d = 1; d <= n; d++) {
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
      const e = logs[iso];
      const wd = (first + d - 1) % 7;
      const cls = ['ag-day', e && 'has', iso === t && 'today', iso > t && 'future', wd > 4 && 'wknd', iso === sel && 'sel'].filter(Boolean).join(' ');
      let inner = `<span class="ag-n">${d}</span>`;
      if (e) {
        const h = fmtMins(parseHours(e.uren));
        inner += `${e.productie ? `<span class="ag-prod" style="--pc:${prodColor(e.productie)}">${esc(e.productie)}</span>` : ''}
          <ul class="ag-t">${e.taken.slice(0, 3).map(x => `<li>${esc(x.replace(/`/g, ''))}</li>`).join('')}${e.taken.length > 3 ? `<li class="more">+${e.taken.length - 3} meer</li>` : ''}</ul>
          <span class="ag-ic">${h ? `<b>${h}</b>` : ''}${e.fouten.length ? `<i class="f">⚠${e.fouten.length}</i>` : ''}${e.geleerd.length ? `<i class="g">✦${e.geleerd.length}</i>` : ''}${e.fotos?.length ? `<i>📷${e.fotos.length}</i>` : ''}</span>`;
      }
      body += `<button class="${cls}" data-d="${iso}">${inner}</button>`;
    }
    body += '</div>';
  } else {
    if (!all.length) body = '<div class="ag-none">Nog geen logs. Begin met <b>new log</b>.</div>';
    const weeks = new Map();
    for (const d of [...all].reverse()) { const k = mondayOf(d); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(d); }
    for (const [mon, ds] of weeks) {
      const sun = addDays(mon, 6);
      const f = x => fromIso(x).toLocaleDateString('nl', { day: 'numeric', month: 'short' });
      body += `<div class="ag-week"><div class="ag-wh"><b>WEEK ${isoWeek(mon)}</b><span>${f(mon)} – ${f(sun)}</span><span class="ag-wsum">${ds.length} dag${ds.length > 1 ? 'en' : ''}${mins(ds) ? ` · ${fmtMins(mins(ds))}` : ''}</span></div>`;
      for (const d of ds) {
        const e = logs[d];
        body += `<button class="ag-row ${d === sel ? 'sel' : ''}" data-d="${d}">
          <span class="ag-rd"><b>${esc(fromIso(d).toLocaleDateString('nl', { weekday: 'short' }))}</b>${fromIso(d).getDate()}</span>
          <span class="ag-rm">${e.productie ? `<span class="ag-prod" style="--pc:${prodColor(e.productie)}">${esc(e.productie)}</span>` : ''}${e.locatie ? `<span class="dim"> @ ${esc(e.locatie)}</span>` : ''}
            <span class="ag-rt">${e.taken.map(x => esc(x.replace(/`/g, ''))).join(' · ') || '<span class="dim">geen taken</span>'}</span></span>
          <span class="ag-ic">${fmtMins(parseHours(e.uren)) ? `<b>${fmtMins(parseHours(e.uren))}</b>` : ''}${e.fouten.length ? `<i class="f">⚠${e.fouten.length}</i>` : ''}${e.fotos?.length ? `<i>📷${e.fotos.length}</i>` : ''}</span>
        </button>`;
      }
      body += '</div>';
    }
  }

  let detail = '';
  if (sel) {
    if (logs[sel]) detail = `${logCardHtml(logs[sel])}
      <div class="ag-actions">
        <button data-act="edit">✎ bewerken</button><button data-act="foto">📷 foto toevoegen</button>
        <button data-act="kopieer">📋 kopieer (OnStage)</button><button data-act="export">⇩ Word van deze dag</button>
      </div>`;
    else detail = `<div class="ag-nolog"><div class="lc-date">📅 ${esc(capDate(sel))}</div><p class="dim">Op deze dag heb je nog geen log.</p>
      <div class="ag-actions"><button data-act="new" class="main">▶ log schrijven voor deze dag</button></div></div>`;
  }

  ov.innerHTML = `<div class="ag-panel">
    <div class="ag-head">
      <div class="ag-title">📅 AGENDA</div>
      <div class="ag-tabs"><button data-mode="maand" class="${mode === 'maand' ? 'on' : ''}">Maand</button><button data-mode="lijst" class="${mode === 'lijst' ? 'on' : ''}">Lijst per week</button></div>
      ${mode === 'maand' ? `<div class="ag-nav"><button data-nav="-1">‹</button><span>${MONTHS[m]} ${y}</span><button data-nav="1">›</button><button data-nav="0" class="ag-today">vandaag</button></div>` : '<div class="ag-nav"><span>hele stage · nieuwste eerst</span></div>'}
      <button class="ag-close" data-close>✕</button>
    </div>
    <div class="ag-stats"><span><b>${totals.length}</b> dag${totals.length === 1 ? '' : 'en'}</span><span><b>${fmtMins(mins(totals)) || '0u'}</b> gewerkt</span><span><b>${totals.reduce((n, d) => n + logs[d].taken.length, 0)}</b> taken</span><span><b>${totals.reduce((n, d) => n + logs[d].geleerd.length, 0)}</b> leerpunten</span><span><b>${new Set(totals.map(d => logs[d].productie).filter(Boolean)).size}</b> producties</span></div>
    <div class="ag-body ${sel ? 'with-detail' : ''}"><div class="ag-main">${body}</div>${sel ? `<div class="ag-detail">${detail}</div>` : ''}</div>
  </div>`;
  if (sel && logs[sel]) hydratePhotos(ov.querySelector('.ag-detail'));
  if (mode === 'lijst') ov.querySelector('.ag-row.sel')?.scrollIntoView({ block: 'nearest' });
}

$('#agenda').addEventListener('click', e => {
  const t = e.target;
  if (t === $('#agenda') || t.closest('[data-close]')) return closeAgenda();
  const mb = t.closest('[data-mode]');
  if (mb) { agenda.mode = mb.dataset.mode; return renderAgenda(); }
  const nb = t.closest('[data-nav]');
  if (nb) {
    if (nb.dataset.nav === '0') { const d = fromIso(today()); agenda.y = d.getFullYear(); agenda.m = d.getMonth(); agenda.sel = logs[today()] ? today() : agenda.sel; }
    else { const d = new Date(agenda.y, agenda.m + +nb.dataset.nav, 1); agenda.y = d.getFullYear(); agenda.m = d.getMonth(); }
    return renderAgenda();
  }
  const day = t.closest('[data-d]');
  if (day) { agenda.sel = agenda.sel === day.dataset.d ? null : day.dataset.d; return renderAgenda(); }
  const act = t.closest('[data-act]');
  if (act && agenda.sel) {
    const d = agenda.sel;
    const cmd = { edit: `edit log ${d}`, foto: `foto ${d}`, kopieer: `kopieer ${d}`, export: `export word van ${d} tot ${d}`, new: `new log ${d}` }[act.dataset.act];
    if (busy || mode !== 'cmd') { say('Rond eerst af waar je mee bezig bent (of druk ^C).', 'warn'); return; }
    closeAgenda();
    runFromUi(cmd);
  }
});

addEventListener('keydown', e => {
  if ($('#agenda').hidden) return;
  if (e.key === 'Escape') closeAgenda();
  if (agenda.mode === 'maand' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement !== input) {
    const d = new Date(agenda.y, agenda.m + (e.key === 'ArrowRight' ? 1 : -1), 1); agenda.y = d.getFullYear(); agenda.m = d.getMonth(); renderAgenda();
  }
});

// ── commando's registreren ────────────────────────────────
COMMANDS.splice(COMMANDS.findIndex(c => c.name === 'edit log') + 1, 0,
  { group: 'Loggen', icon: '📷', name: 'add foto', alias: ['foto', 'fotos', "foto's", 'camera', 'pic'], flags: ['date'], desc: 'Foto\'s toevoegen aan een dag (rig, patch, lichttafel…) — komen mee in Word', usage: 'foto  ·  foto gisteren', fn: cmdFoto });
COMMANDS.splice(COMMANDS.findIndex(c => c.name === 'get log'), 0,
  { group: 'Bekijken', icon: '📅', name: 'agenda', alias: ['kalender', 'calendar', 'overzicht', 'maand'], desc: 'Groot agenda-overzicht: per dag wat je gedaan hebt (maand of lijst per week)', usage: 'agenda  ·  agenda lijst  ·  agenda oktober', fn: cmdAgenda });
COMMANDS.splice(COMMANDS.findIndex(c => c.name === 'export verslag') + 1, 0,
  { group: 'Verslag', icon: '📋', name: 'kopieer', alias: ['copy', 'onstage', 'kopieer log', 'plak'], flags: ['week', 'days', 'from', 'to', 'all', 'month', 'prev'], desc: 'Kopieer een dag of week als nette tekst om in OnStage / mail / Teams te plakken', usage: 'kopieer  ·  kopieer gisteren  ·  kopieer deze week  ·  kopieer vorige week', fn: cmdKopieer });
