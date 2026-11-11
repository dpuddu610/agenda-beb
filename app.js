/* Agenda B&B — tutti i dati restano sul dispositivo (localStorage). */
(() => {
  'use strict';

  const STORE_KEY = 'beb-agenda.prenotazioni.v1';
  const CASE_KEY = 'beb-agenda.case.v1';
  const SERVIZI_KEY = 'beb-agenda.servizi.v1';
  const STRUTTURA_KEY = 'beb-agenda.struttura.v1';

  // Come si calcola il prezzo di un servizio
  const UNITS = {
    soggiorno: 'a soggiorno',
    notte: 'a notte',
    persona: 'a persona',
    personaNotte: 'a persona a notte',
  };
  const DEFAULT_SERVIZI = [
    { id: 'biancheria', nome: 'Biancheria', prezzo: 0, unita: 'persona' },
    { id: 'wifi', nome: 'Wi‑Fi', prezzo: 0, unita: 'soggiorno' },
    { id: 'colazione', nome: 'Colazione', prezzo: 0, unita: 'personaNotte' },
  ];
  const costoServizio = (s, notti, persone) => {
    const n = Math.max(notti, 0), p = Math.max(persone || 0, 0);
    const k = { soggiorno: 1, notte: n, persona: p, personaNotte: n * p }[s.unita] ?? 1;
    return Math.round((s.prezzo || 0) * k * 100) / 100;
  };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Colori dei clienti (testo bianco leggibile su tutti)
  const PALETTE = ['#d84343', '#3b7dd8', '#2e9e5b', '#e08a1e', '#9c4dc4', '#1f9e94', '#d6457f', '#8d6e63', '#5c6bc0', '#7a8b17', '#c2410c', '#0e7490'];
  const color = (b) => PALETTE[(Number(b.colore) || 0) % PALETTE.length];

  // ---------- Formattazione ----------
  const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const fmtShort = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
  const fmtLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtMonth = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
  const money = (n) => eur.format(Number(n) || 0);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Le date sono stringhe "AAAA-MM-GG"; i calcoli usano UTC per evitare problemi con l'ora legale.
  const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const isoFromUTC = (t) => new Date(t).toISOString().slice(0, 10);
  const asDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const addDays = (iso, n) => isoFromUTC(toUTC(iso) + n * 86400000);
  const nightsBetween = (a, b) => (a && b ? Math.round((toUTC(b) - toUTC(a)) / 86400000) : 0);
  const parseNum = (v) => {
    if (v == null) return 0;
    const s = String(v).trim().replace(/\s/g, '').replace(/€/g, '');
    if (!s) return 0;
    // accetta "1.234,50", "1234,5", "1234.5"
    const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = parseFloat(norm);
    return Number.isFinite(n) ? n : NaN;
  };
  const numToInput = (n) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '');
  const round2 = (n) => Math.round(n * 100) / 100;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Dati ----------
  function loadArr(key) {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(bookings));
      localStorage.setItem(CASE_KEY, JSON.stringify(houses));
      localStorage.setItem(SERVIZI_KEY, JSON.stringify(servizi));
      localStorage.setItem(STRUTTURA_KEY, JSON.stringify(struttura));
      localStorage.setItem(STORE_KEY + '.savedAt', new Date().toISOString());
    } catch (e) {
      alert('Attenzione: impossibile salvare i dati sul dispositivo.\n' + e.message);
    }
  }

  let bookings = loadArr(STORE_KEY);
  let houses = loadArr(CASE_KEY);
  let servizi = localStorage.getItem(SERVIZI_KEY) ? loadArr(SERVIZI_KEY) : DEFAULT_SERVIZI.map((s) => ({ ...s }));
  // Dati della struttura stampati nel riepilogo PDF per i clienti
  let struttura = { nome: '', indirizzo: '', telefono: '', email: '', piede: '' };
  try { struttura = { ...struttura, ...(JSON.parse(localStorage.getItem(STRUTTURA_KEY)) || {}) }; } catch {}

  // Converte i dati delle versioni precedenti (casa scritta come testo, servizi sì/no, nessun colore)
  function migrate() {
    let changed = false;
    for (const b of bookings) {
      if (!b.servizi) {
        b.servizi = {};
        for (const k of ['biancheria', 'wifi', 'colazione']) {
          if (b[k]) b.servizi[k] = { nome: DEFAULT_SERVIZI.find((s) => s.id === k).nome, importo: 0 };
        }
        changed = true;
      }
      for (const k of ['biancheria', 'wifi', 'colazione']) if (k in b) { delete b[k]; changed = true; }
      if (!b.casaId && b.casa) {
        let h = houses.find((x) => x.nome.toLowerCase() === b.casa.trim().toLowerCase());
        if (!h) {
          h = { id: uid(), nome: b.casa.trim(), haProprietario: !!b.haProprietario, proprietario: b.proprietario || '', quotaPerc: b.quotaPerc || 0, note: '' };
          houses.push(h);
        }
        b.casaId = h.id;
        changed = true;
      }
      if ('casa' in b) { delete b.casa; changed = true; }
    }
    if (bookings.some((b) => !b.casaId)) {
      let h = houses[0];
      if (!h) { h = { id: uid(), nome: 'Casa principale', haProprietario: false, proprietario: '', quotaPerc: 0, note: '' }; houses.push(h); }
      bookings.forEach((b) => { if (!b.casaId) b.casaId = h.id; });
      changed = true;
    }
    [...bookings].sort((a, b) => a.arrivo.localeCompare(b.arrivo)).forEach((b, i) => {
      if (typeof b.colore !== 'number') { b.colore = i % PALETTE.length; changed = true; }
    });
    if (changed) save();
  }
  migrate();

  // Prezzo di un servizio per una casa: quello personalizzato della casa, altrimenti quello base
  function servDef(id, casaId) {
    const s = servizi.find((x) => x.id === id);
    if (!s) return null;
    const o = houses.find((h) => h.id === casaId)?.prezziServizi?.[id];
    return o ? { ...s, prezzo: o.prezzo, unita: o.unita || s.unita, personalizzato: true } : s;
  }

  const houseOf = (b) => houses.find((h) => h.id === b.casaId);
  const houseName = (b) => (houseOf(b)?.nome || '—');
  const sortedHouses = () => [...houses].sort((a, b) => a.nome.localeCompare(b.nome));

  const saldo = (b) => round2((b.totale || 0) - (b.haAcconto ? b.acconto || 0 : 0));
  const quotaProp = (b) => (b.haProprietario ? b.quotaProprietario || 0 : 0);
  const nostro = (b) => round2((b.totale || 0) - quotaProp(b));

  // Sceglie un colore poco usato dalle prenotazioni vicine nel tempo
  function autoColor(arrivo, partenza, exceptId) {
    const from = addDays(arrivo, -10), to = addDays(partenza || arrivo, 10);
    const used = new Array(PALETTE.length).fill(0);
    for (const b of bookings) {
      if (b.id === exceptId) continue;
      if (b.arrivo < to && b.partenza > from) used[(b.colore || 0) % PALETTE.length]++;
    }
    const min = Math.min(...used);
    // a parità, parte da un indice legato al numero di prenotazioni per variare
    const start = bookings.length % PALETTE.length;
    for (let k = 0; k < PALETTE.length; k++) { const i = (start + k) % PALETTE.length; if (used[i] === min) return i; }
    return 0;
  }

  let state = {
    view: 'agenda', filter: 'prossime', search: '', agendaCasa: '', prezziCasa: '',
    calMonth: todayISO().slice(0, 7), calSel: todayISO(), calMode: 'totale', calCasa: '',
  };

  // Chiede al sistema di non cancellare i dati (dove supportato)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Navigazione ----------
  const titles = { agenda: 'Prenotazioni', calendario: 'Calendario', case: 'Case', conti: 'Conti e backup', prezzi: 'Prezzi dei servizi' };
  $$('.tabbar button').forEach((btn) => btn.addEventListener('click', () => { state.view = btn.dataset.view; render(); window.scrollTo(0, 0); }));
  $('#fab').addEventListener('click', () => {
    if (state.view === 'case') return openCasa(null);
    const casaId = state.view === 'calendario' && state.calMode === 'casa' ? state.calCasa : (state.view === 'agenda' ? state.agendaCasa : '');
    openForm(null, state.view === 'calendario' ? state.calSel : null, casaId);
  });

  function render() {
    $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    $('#title').textContent = titles[state.view];
    $('#fab').hidden = state.view === 'conti' || state.view === 'prezzi';
    $('#fab').setAttribute('aria-label', state.view === 'case' ? 'Nuova casa' : 'Nuova prenotazione');
    const main = $('#main');
    if (state.view === 'agenda') main.innerHTML = renderAgenda();
    else if (state.view === 'calendario') main.innerHTML = renderCalendar();
    else if (state.view === 'case') main.innerHTML = renderCase();
    else if (state.view === 'prezzi') main.innerHTML = renderPrezzi();
    else main.innerHTML = renderConti();
    bindView();
  }

  const houseSelect = (id, value, allLabel) => houses.length > 1 ? `
    <select class="search" id="${id}">
      <option value="">${allLabel}</option>
      ${sortedHouses().map((h) => `<option value="${h.id}" ${h.id === value ? 'selected' : ''}>${esc(h.nome)}</option>`).join('')}
    </select>` : '';

  // ---------- Agenda ----------
  function statusOf(b, today) {
    if (b.arrivo === today) return { t: 'Arriva oggi', c: '' };
    if (b.partenza === today) return { t: 'Parte oggi', c: 'warn' };
    if (b.arrivo < today && b.partenza > today) return { t: 'In casa', c: '' };
    return null;
  }

  function bookingCard(b, today) {
    const n = nightsBetween(b.arrivo, b.partenza);
    const st = statusOf(b, today);
    const sv = b.servizi || {};
    const tags = [
      ...servizi.map((s) => [s.id, s.nome]),
      ...Object.keys(sv).filter((k) => !servizi.some((s) => s.id === k)).map((k) => [k, sv[k].nome]),
    ].map(([id, nome]) => `<span class="tag ${sv[id] ? 'on' : ''}">${sv[id] ? '✓' : '✗'} ${esc(nome)}${sv[id]?.importo ? ` ${money(sv[id].importo)}` : ''}</span>`).join('');
    const prop = b.haProprietario
      ? `<span class="tag ${b.proprietarioPagato ? 'ok' : 'warn'}">👤 ${esc(b.proprietario || 'Proprietario')}: ${money(b.quotaProprietario)}${b.proprietarioPagato ? ' ✓ pagato' : ' da dare'}</span>`
      : '';
    return `
      <button class="card booking" data-id="${b.id}" style="border-left:6px solid ${color(b)}">
        <div class="top">
          <div class="name">${esc(b.nome)}${st ? `<span class="badge ${st.c}">${st.t}</span>` : ''}</div>
          <div class="price">${money(b.totale)}</div>
        </div>
        <div class="dates">🏠 <b>${esc(houseName(b))}</b> · ${fmtShort.format(asDate(b.arrivo))} → ${fmtShort.format(asDate(b.partenza))} · ${n} ${n === 1 ? 'notte' : 'notti'} · ${b.persone} ${b.persone == 1 ? 'persona' : 'persone'}</div>
        <div class="tags">
          ${tags}
          ${prop}
        </div>
        <div class="money">
          <span>Al giorno <b>${money(b.prezzo)}</b></span>
          <span>Acconto <b>${b.haAcconto ? money(b.acconto) : 'no'}</b></span>
          <span>Da saldare <b>${money(saldo(b))}</b></span>
        </div>
      </button>`;
  }

  function renderAgenda() {
    const today = todayISO();
    if (state.agendaCasa && !houses.some((h) => h.id === state.agendaCasa)) state.agendaCasa = '';
    const base = bookings.filter((b) => !state.agendaCasa || b.casaId === state.agendaCasa);
    const inCasa = base.filter((b) => b.arrivo <= today && b.partenza > today);
    const arrivi = base.filter((b) => b.arrivo === today).length;
    const partenze = base.filter((b) => b.partenza === today).length;
    const ospiti = inCasa.reduce((a, b) => a + (Number(b.persone) || 0), 0);

    const q = state.search.trim().toLowerCase();
    const list = base.filter((b) => {
      if (state.filter === 'prossime' && b.partenza < today) return false;
      if (state.filter === 'passate' && b.partenza >= today) return false;
      if (q && !`${b.nome} ${b.telefono || ''} ${b.note || ''} ${houseName(b)} ${b.proprietario || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => (state.filter === 'passate' ? b.arrivo.localeCompare(a.arrivo) : a.arrivo.localeCompare(b.arrivo)));

    let html = '';
    let lastMonth = '';
    for (const b of list) {
      const m = b.arrivo.slice(0, 7);
      if (m !== lastMonth) { html += `<div class="section-title">${fmtMonth.format(asDate(m + '-01'))}</div>`; lastMonth = m; }
      html += bookingCard(b, today);
    }
    if (!list.length) {
      html = `<div class="empty">${bookings.length ? 'Nessuna prenotazione trovata.' : 'Nessuna prenotazione ancora.<br>Tocca <b>+</b> per aggiungerne una.'}</div>`;
    }

    return `
      <div class="today">
        <div class="stat"><b>${arrivi}</b><span>arrivi oggi</span></div>
        <div class="stat"><b>${partenze}</b><span>partenze oggi</span></div>
        <div class="stat"><b>${ospiti}</b><span>ospiti in casa</span></div>
      </div>
      <div class="section-title">${fmtLong.format(new Date())}</div>
      ${houseSelect('agenda-casa', state.agendaCasa, 'Tutte le case')}
      <div class="segmented" id="filter">
        ${['prossime', 'passate', 'tutte'].map((f) => `<button data-f="${f}" class="${state.filter === f ? 'active' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
      </div>
      <input class="search" id="search" type="search" placeholder="Cerca nome, telefono, casa…" value="${esc(state.search)}">
      <div id="list">${html}</div>`;
  }

  // ---------- Calendario ----------
  // Ogni prenotazione è una barra colorata che parte a metà del giorno di arrivo
  // e finisce a metà del giorno di partenza (così i cambi nello stesso giorno si vedono bene).
  function renderCalendar() {
    const today = todayISO();
    if (state.calMode === 'casa' && !houses.some((h) => h.id === state.calCasa)) state.calCasa = sortedHouses()[0]?.id || '';
    const perCasa = state.calMode === 'casa';
    const list = bookings.filter((b) => !perCasa || b.casaId === state.calCasa);

    const [y, m] = state.calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${state.calMonth}-01`;
    const monthEnd = addDays(`${state.calMonth}-${String(daysInMonth).padStart(2, '0')}`, 1); // esclusivo
    const gridStart = addDays(monthStart, -((first.getDay() + 6) % 7)); // lunedì
    const totalDays = nightsBetween(gridStart, monthEnd);
    const weeks = Math.ceil(totalDays / 7);
    const gridEnd = addDays(gridStart, weeks * 7);

    // prenotazioni visibili, in "mezze giornate" dall'inizio della griglia
    const vis = list
      .filter((b) => b.arrivo < gridEnd && b.partenza > gridStart)
      .sort((a, b) => a.arrivo.localeCompare(b.arrivo) || a.partenza.localeCompare(b.partenza))
      .map((b) => ({ b, s: nightsBetween(gridStart, b.arrivo) * 2 + 1, e: nightsBetween(gridStart, b.partenza) * 2 + 1 }));
    // assegna una corsia (riga) a ogni prenotazione, riusando quelle libere
    const laneEnds = [];
    for (const v of vis) {
      let lane = laneEnds.findIndex((end) => end <= v.s);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = v.e;
      v.lane = lane;
    }

    let weeksHtml = '';
    for (let w = 0; w < weeks; w++) {
      const h0 = w * 14, h1 = h0 + 14;
      const segs = vis.filter((v) => v.s < h1 && v.e > h0);
      const lanes = [...new Set(segs.map((v) => v.lane))].sort((a, b) => a - b);
      const rows = Math.max(lanes.length, perCasa ? 1 : 2);
      let cells = '';
      for (let d = 0; d < 7; d++) {
        const iso = addDays(gridStart, w * 7 + d);
        const out = iso < monthStart || iso >= monthEnd;
        cells += `<button class="dcell ${out ? 'out' : ''} ${iso === today ? 'today' : ''} ${iso === state.calSel ? 'sel' : ''}" data-day="${iso}" style="grid-column:${d * 2 + 1} / span 2"><span class="n">${Number(iso.slice(8))}</span></button>`;
      }
      let bars = '';
      for (const v of segs) {
        const cs = Math.max(v.s, h0) - h0 + 1;
        const ce = Math.min(v.e, h1) - h0 + 1;
        const starts = v.s >= h0, ends = v.e <= h1;
        const label = perCasa ? v.b.nome : `${v.b.nome} · ${houseName(v.b)}`;
        bars += `<button class="bar ${starts ? 'bs' : ''} ${ends ? 'be' : ''}" data-id="${v.b.id}" title="${esc(label)}"
          style="grid-row:${lanes.indexOf(v.lane) + 2};grid-column:${cs} / ${ce};background:${color(v.b)}">${esc(label)}</button>`;
      }
      weeksHtml += `<div class="week" style="grid-template-rows:24px repeat(${rows}, 20px) 4px">${cells}${bars}</div>`;
    }

    // Prenotazioni del giorno selezionato
    const sel = state.calSel;
    const dayList = list
      .filter((b) => (b.arrivo <= sel && b.partenza > sel) || b.partenza === sel)
      .sort((a, b) => a.arrivo.localeCompare(b.arrivo));

    // Riepilogo del mese (notti che cadono nel mese)
    let notti = 0, incasso = 0, quoteProp = 0;
    for (const b of list) {
      const s = b.arrivo > monthStart ? b.arrivo : monthStart;
      const e = b.partenza < monthEnd ? b.partenza : monthEnd;
      const nm = nightsBetween(s, e);
      if (nm <= 0) continue;
      const tot = nightsBetween(b.arrivo, b.partenza) || 1;
      notti += nm;
      incasso += (b.totale || 0) * nm / tot;
      quoteProp += quotaProp(b) * nm / tot;
    }
    const nCase = perCasa ? 1 : Math.max(houses.length, 1);
    const occup = Math.round((notti / (daysInMonth * nCase)) * 100);

    const modeBar = `
      <div class="segmented" id="cal-mode">
        <button data-mode="totale" class="${!perCasa ? 'active' : ''}">Tutte le case</button>
        <button data-mode="casa" class="${perCasa ? 'active' : ''}">Per casa</button>
      </div>
      ${perCasa ? `<div class="chips" id="cal-case">${sortedHouses().map((h) => `<button data-casa="${h.id}" class="${h.id === state.calCasa ? 'active' : ''}">${esc(h.nome)}</button>`).join('') || '<span class="muted small">Nessuna casa: aggiungila dalla scheda Case.</span>'}</div>` : ''}`;

    return `
      ${modeBar}
      <div class="cal-head">
        <button id="prev" aria-label="Mese precedente">‹</button>
        <strong>${fmtMonth.format(first)}</strong>
        <button id="next" aria-label="Mese successivo">›</button>
      </div>
      <div class="cal-dow">${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal2">${weeksHtml}</div>
      <div class="legend">Ogni barra è un cliente: inizia a metà del giorno di arrivo e finisce a metà del giorno di partenza. Tocca una barra per aprire la prenotazione.</div>

      <div class="summary">
        <div><b>${notti}</b><span>notti prenotate · ${occup}% occupazione</span></div>
        <div><b>${money(incasso)}</b><span>incasso del mese</span></div>
        <div><b>${money(quoteProp)}</b><span>quote proprietari</span></div>
        <div><b>${money(incasso - quoteProp)}</b><span>resta a noi</span></div>
      </div>

      <div class="section-title">${fmtLong.format(asDate(sel))}</div>
      ${dayList.length ? dayList.map((b) => bookingCard(b, today)).join('') : '<div class="empty">Nessuna prenotazione in questo giorno.</div>'}`;
  }

  // ---------- Case ----------
  function renderCase() {
    const today = todayISO();
    if (!houses.length) return '<div class="empty">Nessuna casa ancora.<br>Tocca <b>+</b> per aggiungerne una.</div>';
    return sortedHouses().map((h) => {
      const hb = bookings.filter((b) => b.casaId === h.id);
      const now = hb.find((b) => b.arrivo <= today && b.partenza > today);
      const next = hb.filter((b) => b.arrivo > today).sort((a, b) => a.arrivo.localeCompare(b.arrivo))[0];
      return `
        <button class="card booking" data-casa="${h.id}">
          <div class="top"><div class="name">🏠 ${esc(h.nome)}</div><div class="muted small">${hb.length} pren.</div></div>
          <div class="dates">${h.haProprietario ? `Proprietario: <b>${esc(h.proprietario)}</b>${h.quotaPerc ? ` · quota ${numToInput(h.quotaPerc)}%` : ''}` : 'Casa nostra'}${h.prezzo ? ` · ${money(h.prezzo)} a notte` : ''}</div>
          <div class="tags">
            ${now ? `<span class="tag on">Ora: ${esc(now.nome)} fino al ${fmtShort.format(asDate(now.partenza))}</span>` : '<span class="tag">Libera oggi</span>'}
            ${next ? `<span class="tag">Prossimo: ${esc(next.nome)} il ${fmtShort.format(asDate(next.arrivo))}</span>` : ''}
            ${servizi.map((s) => { const d = servDef(s.id, h.id); return `<span class="tag ${d.personalizzato ? 'on' : ''}">${esc(s.nome)} ${money(d.prezzo)} ${UNITS[d.unita]}</span>`; }).join('')}
          </div>
          ${h.note ? `<div class="muted small" style="margin-top:6px;white-space:pre-line">${esc(h.note)}</div>` : ''}
        </button>`;
    }).join('');
  }

  // ---------- Prezzi dei servizi ----------
  function renderPrezzi() {
    const unitOpts = (sel) => Object.entries(UNITS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
    if (state.prezziCasa && !houses.some((h) => h.id === state.prezziCasa)) state.prezziCasa = '';
    const chips = houses.length ? `
      <div class="chips" id="prezzi-case">
        <button data-casa="" class="${!state.prezziCasa ? 'active' : ''}">Prezzi base</button>
        ${sortedHouses().map((h) => `<button data-casa="${h.id}" class="${h.id === state.prezziCasa ? 'active' : ''}">🏠 ${esc(h.nome)}</button>`).join('')}
      </div>` : '';

    // Prezzi di una casa: ogni servizio può avere un prezzo suo, altrimenti usa quello base
    if (state.prezziCasa) {
      const h = houses.find((x) => x.id === state.prezziCasa);
      return `
        ${chips}
        <div class="card small">Prezzi dei servizi per <b>${esc(h.nome)}</b>.<br><span class="muted">Lascia vuoto per usare il prezzo base. Cambiare questi prezzi non modifica le prenotazioni già salvate.</span></div>
        ${servizi.map((s) => {
          const o = h.prezziServizi?.[s.id];
          return `
          <div class="group" data-hsid="${s.id}">
            <div class="row"><strong>${esc(s.nome)}</strong>${o ? '<span class="tag on">prezzo della casa</span>' : `<span class="tag">base: ${money(s.prezzo)} ${UNITS[s.unita]}</span>`}</div>
            <label class="row"><span>Prezzo €</span><input data-k="prezzo" type="text" inputmode="decimal" value="${o ? numToInput(o.prezzo) || '0' : ''}" placeholder="${numToInput(s.prezzo) || '0'} (base)"></label>
            <label class="row"><span>Si paga</span><select data-k="unita">${unitOpts(o?.unita || s.unita)}</select></label>
            ${o ? `<button type="button" class="row del-serv" data-reset="${s.id}">Usa il prezzo base</button>` : ''}
          </div>`;
        }).join('') || '<div class="empty">Nessun servizio: aggiungili in "Prezzi base".</div>'}`;
    }

    return `
      ${chips}
      <div class="card small">Imposta qui la cifra base di ogni servizio. Quando in una prenotazione attivi un servizio, il costo viene calcolato da solo e aggiunto al totale.${houses.length ? '<br>Per dare a una casa prezzi diversi, scegli la casa qui sopra.' : ''}<br><span class="muted">Cambiare questi prezzi non modifica le prenotazioni già salvate.</span></div>
      ${servizi.map((s) => `
        <div class="group" data-sid="${s.id}">
          <label class="row"><span>Servizio</span><input data-k="nome" type="text" value="${esc(s.nome)}" placeholder="Nome servizio"></label>
          <label class="row"><span>Prezzo €</span><input data-k="prezzo" type="text" inputmode="decimal" value="${numToInput(s.prezzo)}" placeholder="0,00"></label>
          <label class="row"><span>Si paga</span><select data-k="unita">${unitOpts(s.unita)}</select></label>
          <button type="button" class="row del-serv" data-del="${s.id}">Elimina servizio</button>
        </div>`).join('')}
      <button class="btn secondary" id="add-serv">+ Aggiungi servizio</button>
      <div class="small muted" style="margin:10px 4px">Esempi: tassa di soggiorno (a persona a notte), pulizia finale (a soggiorno), culla (a notte)…</div>`;
  }

  // ---------- Conti e backup ----------
  function renderConti() {
    const today = todayISO();
    const year = today.slice(0, 4);

    // Quote da dare ai proprietari (non ancora pagate), raggruppate per proprietario
    const owners = {};
    for (const b of bookings) {
      if (!b.haProprietario) continue;
      const k = (b.proprietario || 'Senza nome').trim();
      owners[k] ??= { daDare: 0, pagato: 0, items: [] };
      if (b.proprietarioPagato) owners[k].pagato += b.quotaProprietario || 0;
      else { owners[k].daDare += b.quotaProprietario || 0; owners[k].items.push(b); }
    }
    const ownerNames = Object.keys(owners).sort((a, b) => a.localeCompare(b));
    const ownersHtml = ownerNames.length
      ? ownerNames.map((k) => `
          <div class="card">
            <div class="owner-row" style="border:0"><strong>👤 ${esc(k)}</strong><strong style="color:${owners[k].daDare ? 'var(--warn)' : 'var(--ok)'}">${money(owners[k].daDare)}</strong></div>
            ${owners[k].items.sort((a, b) => a.arrivo.localeCompare(b.arrivo)).map((b) => `
              <div class="owner-row small"><span>${esc(b.nome)} · ${esc(houseName(b))} · ${fmtShort.format(asDate(b.arrivo))}→${fmtShort.format(asDate(b.partenza))}</span><span>${money(b.quotaProprietario)}</span></div>`).join('')}
            <div class="owner-row small muted"><span>Già pagato in totale</span><span>${money(owners[k].pagato)}</span></div>
          </div>`).join('')
      : '<div class="card muted small">Nessuna prenotazione in case di altri proprietari.</div>';

    // Totali dell'anno (per data di arrivo)
    const yb = bookings.filter((b) => b.arrivo.startsWith(year));
    const sum = (arr, f) => arr.reduce((a, b) => a + f(b), 0);
    const daIncassare = bookings.filter((b) => b.partenza >= today).reduce((a, b) => a + saldo(b), 0);
    const perCasa = houses.length > 1 ? `
      <div class="card">
        ${sortedHouses().map((h) => { const hb = yb.filter((b) => b.casaId === h.id); return `
          <div class="owner-row small"><span>🏠 ${esc(h.nome)} · ${sum(hb, (b) => nightsBetween(b.arrivo, b.partenza))} notti</span><span>${money(sum(hb, (b) => b.totale || 0))} · a noi <b>${money(sum(hb, nostro))}</b></span></div>`; }).join('')}
      </div>` : '';

    const savedAt = localStorage.getItem(STORE_KEY + '.savedAt');
    const lastBackup = localStorage.getItem(STORE_KEY + '.backupAt');

    return `
      <div class="section-title">Da dare ai proprietari</div>
      ${ownersHtml}

      <div class="section-title">Anno ${year}</div>
      <div class="summary">
        <div><b>${yb.length}</b><span>prenotazioni</span></div>
        <div><b>${sum(yb, (b) => nightsBetween(b.arrivo, b.partenza))}</b><span>notti</span></div>
        <div><b>${money(sum(yb, (b) => b.totale || 0))}</b><span>incasso totale</span></div>
        <div><b>${money(sum(yb, (b) => (b.haAcconto ? b.acconto || 0 : 0)))}</b><span>acconti ricevuti</span></div>
        <div><b>${money(sum(yb, quotaProp))}</b><span>quote proprietari</span></div>
        <div><b>${money(sum(yb, nostro))}</b><span>resta a noi</span></div>
      </div>
      ${perCasa ? `<div class="section-title">Per casa · ${year}</div>${perCasa}` : ''}
      <div class="card small" style="margin-top:8px">Saldi ancora da incassare (prenotazioni in corso e future): <b>${money(daIncassare)}</b></div>

      <div class="section-title">Dati per il riepilogo PDF ai clienti</div>
      <div class="group" id="struttura">
        <label class="row"><span>Nome struttura</span><input data-k="nome" type="text" value="${esc(struttura.nome)}" placeholder="es. B&B Il Glicine"></label>
        <label class="row"><span>Indirizzo</span><input data-k="indirizzo" type="text" value="${esc(struttura.indirizzo)}" placeholder="facoltativo"></label>
        <label class="row"><span>Telefono</span><input data-k="telefono" type="tel" value="${esc(struttura.telefono)}" placeholder="facoltativo"></label>
        <label class="row"><span>Email</span><input data-k="email" type="text" inputmode="email" value="${esc(struttura.email)}" placeholder="facoltativo"></label>
        <label class="row col"><span>Testo in fondo al riepilogo</span><textarea data-k="piede" rows="3" placeholder="es. IBAN per il saldo, orario check-out, grazie per averci scelto…">${esc(struttura.piede)}</textarea></label>
      </div>

      <div class="section-title">Backup</div>
      <div class="card small">
        I dati sono salvati <b>solo su questo telefono</b>, non serve internet.
        Fai ogni tanto un backup e salvalo in File / iCloud / invialo via mail, così non perdi niente se cambi telefono.<br><br>
        <span class="muted">Prenotazioni: ${bookings.length} · Case: ${houses.length}${savedAt ? ` · ultima modifica ${new Date(savedAt).toLocaleString('it-IT')}` : ''}<br>
        Ultimo backup: ${lastBackup ? new Date(lastBackup).toLocaleString('it-IT') : 'mai'}</span>
        <button class="btn" id="exp-json">Esporta backup</button>
        <button class="btn secondary" id="exp-csv">Esporta per Excel (CSV)</button>
        <button class="btn secondary" id="imp-json">Ripristina da backup…</button>
        <input type="file" id="imp-file" accept=".json,application/json" hidden>
      </div>`;
  }

  // ---------- Eventi della vista ----------
  function bindView() {
    $$('.booking[data-id], .bar[data-id]').forEach((el) => el.addEventListener('click', () => openForm(bookings.find((b) => b.id === el.dataset.id))));

    if (state.view === 'agenda') {
      $$('#filter button').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.f; render(); }));
      $('#agenda-casa')?.addEventListener('change', (e) => { state.agendaCasa = e.target.value; render(); });
      const s = $('#search');
      s.addEventListener('input', () => {
        state.search = s.value;
        const pos = s.selectionStart;
        render();
        const ns = $('#search'); ns.focus(); try { ns.setSelectionRange(pos, pos); } catch {}
      });
    }
    if (state.view === 'calendario') {
      const shift = (n) => {
        const [y, m] = state.calMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + n, 1);
        state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        state.calSel = state.calMonth === todayISO().slice(0, 7) ? todayISO() : `${state.calMonth}-01`;
        render();
      };
      $('#prev').addEventListener('click', () => shift(-1));
      $('#next').addEventListener('click', () => shift(1));
      $$('#cal-mode button').forEach((b) => b.addEventListener('click', () => { state.calMode = b.dataset.mode; render(); }));
      $$('#cal-case button').forEach((b) => b.addEventListener('click', () => { state.calCasa = b.dataset.casa; render(); }));
      $$('.dcell').forEach((d) => d.addEventListener('click', () => {
        state.calSel = d.dataset.day;
        if (d.dataset.day.slice(0, 7) !== state.calMonth) state.calMonth = d.dataset.day.slice(0, 7);
        render();
      }));
    }
    if (state.view === 'case') {
      $$('.booking[data-casa]').forEach((el) => el.addEventListener('click', () => openCasa(houses.find((h) => h.id === el.dataset.casa))));
    }
    if (state.view === 'prezzi') {
      $$('#prezzi-case button').forEach((b) => b.addEventListener('click', () => { state.prezziCasa = b.dataset.casa; render(); }));
      // prezzi personalizzati della casa
      $$('[data-hsid]').forEach((g) => g.addEventListener('change', (e) => {
        const h = houses.find((x) => x.id === state.prezziCasa);
        const s = servizi.find((x) => x.id === g.dataset.hsid);
        if (!h || !s) return;
        h.prezziServizi ??= {};
        const cur = h.prezziServizi[s.id];
        const prezzoEl = $('[data-k="prezzo"]', g), unitaEl = $('[data-k="unita"]', g);
        const raw = prezzoEl.value.trim();
        const v = parseNum(raw);
        if (raw && (Number.isNaN(v) || v < 0)) { alert('Prezzo non valido.'); prezzoEl.value = cur ? numToInput(cur.prezzo) : ''; return; }
        if (!raw && unitaEl.value === s.unita) delete h.prezziServizi[s.id];
        else h.prezziServizi[s.id] = { prezzo: raw ? round2(v) : (cur ? cur.prezzo : s.prezzo), unita: unitaEl.value };
        save(); render(); toast('Salvato');
      }));
      $$('[data-reset]').forEach((b) => b.addEventListener('click', () => {
        const h = houses.find((x) => x.id === state.prezziCasa);
        if (h?.prezziServizi) delete h.prezziServizi[b.dataset.reset];
        save(); render(); toast('Ora usa il prezzo base');
      }));
      $$('[data-sid]').forEach((g) => g.addEventListener('change', (e) => {
        const s = servizi.find((x) => x.id === g.dataset.sid);
        const k = e.target.dataset.k;
        if (!s || !k) return;
        if (k === 'prezzo') {
          const v = parseNum(e.target.value);
          if (Number.isNaN(v) || v < 0) { alert('Prezzo non valido.'); e.target.value = numToInput(s.prezzo); return; }
          s.prezzo = round2(v); e.target.value = numToInput(s.prezzo);
        } else if (k === 'nome') {
          const v = e.target.value.trim();
          if (!v) { e.target.value = s.nome; return; }
          s.nome = v;
        } else s.unita = e.target.value;
        save(); toast('Salvato');
      }));
      $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
        const s = servizi.find((x) => x.id === b.dataset.del);
        if (!s || !confirm(`Eliminare il servizio "${s.nome}"?\nLe prenotazioni già salvate lo mantengono.`)) return;
        servizi = servizi.filter((x) => x !== s);
        save(); render();
      }));
      $('#add-serv').addEventListener('click', () => {
        servizi.push({ id: uid(), nome: 'Nuovo servizio', prezzo: 0, unita: 'soggiorno' });
        save(); render();
        const last = $$('[data-sid]').pop();
        last.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inp = $('input[data-k="nome"]', last); inp.focus(); inp.select();
      });
    }
    if (state.view === 'conti') {
      $('#struttura').addEventListener('change', (e) => {
        const k = e.target.dataset.k;
        if (!k) return;
        struttura[k] = e.target.value.trim();
        save(); toast('Salvato');
      });
      $('#exp-json').addEventListener('click', exportJSON);
      $('#exp-csv').addEventListener('click', exportCSV);
      $('#imp-json').addEventListener('click', () => $('#imp-file').click());
      $('#imp-file').addEventListener('change', importJSON);
    }
  }

  function fillOwnersList() {
    const names = [...new Set([...bookings.map((b) => b.proprietario), ...houses.map((h) => h.proprietario)].filter(Boolean).map((s) => s.trim()))].sort();
    $('#proprietari-list').innerHTML = names.map((c) => `<option value="${esc(c)}">`).join('');
  }

  function openSheet(el) { el.hidden = false; el.scrollTop = 0; document.body.style.overflow = 'hidden'; }
  function closeSheet(el) { el.hidden = true; if ($('#sheet').hidden && $('#sheet-casa').hidden) document.body.style.overflow = ''; }

  // ---------- Modulo prenotazione ----------
  const form = $('#form');
  const sheet = $('#sheet');
  let editing = null;      // prenotazione in modifica (o null)
  let totaleManuale = false;
  let colore = 0;
  let colorePicked = false;

  function fillHouseOptions(selected) {
    const sel = form.elements.casaId;
    sel.innerHTML = `${houses.length !== 1 ? `<option value="" disabled ${selected ? '' : 'selected'}>Scegli…</option>` : ''}
      ${sortedHouses().map((h) => `<option value="${h.id}" ${h.id === selected ? 'selected' : ''}>${esc(h.nome)}</option>`).join('')}
      <option value="__new">➕ Aggiungi casa…</option>`;
    if (houses.length === 1 && !selected) sel.value = houses[0].id;
  }

  function renderColors() {
    $('#colors').innerHTML = PALETTE.map((c, i) => `<button type="button" class="dot ${i === colore ? 'on' : ''}" data-c="${i}" style="background:${c}" aria-label="Colore ${i + 1}"></button>`).join('');
  }
  $('#colors').addEventListener('click', (e) => {
    const d = e.target.closest('[data-c]');
    if (!d) return;
    colore = Number(d.dataset.c); colorePicked = true; renderColors();
  });

  // Propone i dati del proprietario in base alla casa scelta
  function applyHouseDefaults(h) {
    const f = form.elements;
    if (!h) return;
    if (h.prezzo) { f.prezzo.value = numToInput(h.prezzo); if (!editing) totaleManuale = false; }
    // i servizi attivi si ricalcolano con i prezzi della nuova casa
    for (const id of Object.keys(formServ)) if (servizi.some((s) => s.id === id)) formServ[id].importo = null;
    f.haProprietario.checked = !!h.haProprietario;
    if (h.haProprietario) {
      f.proprietario.value = h.proprietario || '';
      f.quotaPerc.value = numToInput(h.quotaPerc);
      if (!h.quotaPerc) f.quotaProprietario.value = '';
    } else {
      f.proprietario.value = ''; f.quotaPerc.value = ''; f.quotaProprietario.value = ''; f.proprietarioPagato.checked = false;
    }
    recalc('quotaPerc');
  }

  form.elements.casaId.addEventListener('change', (e) => {
    if (e.target.value === '__new') {
      const nome = (prompt('Nome della nuova casa:') || '').trim();
      if (!nome) { fillHouseOptions(''); return; }
      let h = houses.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
      if (!h) { h = { id: uid(), nome, haProprietario: false, proprietario: '', quotaPerc: 0, note: '' }; houses.push(h); save(); }
      fillHouseOptions(h.id);
      toast('Casa aggiunta (puoi completarla dalla scheda Case)');
      applyHouseDefaults(h);
      return;
    }
    applyHouseDefaults(houses.find((h) => h.id === e.target.value));
  });

  function openForm(b, defaultDate, defaultCasa) {
    editing = b || null;
    fillOwnersList();
    form.reset();
    const f = form.elements;
    const arr = defaultDate && defaultDate >= todayISO() ? defaultDate : todayISO();
    const d = b || { nome: '', telefono: '', arrivo: arr, partenza: addDays(arr, 1), persone: 2, servizi: {}, prezzo: 0, totale: 0, haAcconto: false, acconto: 0, casaId: defaultCasa || '', haProprietario: false, proprietario: '', quotaPerc: 0, quotaProprietario: 0, proprietarioPagato: false, note: '' };
    fillHouseOptions(d.casaId);
    f.nome.value = d.nome; f.telefono.value = d.telefono || '';
    f.arrivo.value = d.arrivo; f.partenza.value = d.partenza;
    f.persone.value = d.persone;
    formServ = JSON.parse(JSON.stringify(d.servizi || {}));
    renderServiziForm();
    f.prezzo.value = numToInput(d.prezzo); f.totale.value = numToInput(d.totale);
    f.haAcconto.checked = !!d.haAcconto; f.acconto.value = numToInput(d.acconto);
    f.haProprietario.checked = !!d.haProprietario; f.proprietario.value = d.proprietario || '';
    f.quotaPerc.value = numToInput(d.quotaPerc); f.quotaProprietario.value = numToInput(d.quotaProprietario);
    f.proprietarioPagato.checked = !!d.proprietarioPagato;
    f.note.value = d.note || '';
    totaleManuale = !!(b && b.totaleManuale);
    colorePicked = !!b;
    colore = b ? Number(b.colore) || 0 : autoColor(d.arrivo, d.partenza);
    renderColors();
    if (!b && f.casaId.value) applyHouseDefaults(houses.find((h) => h.id === f.casaId.value));
    $('#form-title').textContent = b ? 'Modifica prenotazione' : 'Nuova prenotazione';
    $('#btn-delete').hidden = !b;
    $$('input, select', form).forEach((i) => i.classList.remove('invalid'));
    openSheet(sheet);
    recalc();
    if (!b) setTimeout(() => f.nome.focus(), 250);
  }

  function closeForm() { closeSheet(sheet); editing = null; }

  function recalc(source) {
    const f = form.elements;
    const n = nightsBetween(f.arrivo.value, f.partenza.value);
    $('#notti').textContent = f.arrivo.value && f.partenza.value ? (n > 0 ? n : '⚠️ date non valide') : '–';

    // costo dei servizi attivi
    const persone = parseInt(f.persone.value, 10) || 0;
    let extra = 0;
    const casaId = f.casaId.value;
    for (const id of Object.keys(formServ)) {
      const def = servDef(id, casaId);
      if (def && (formServ[id].importo == null || source === 'date' || source === 'persone')) {
        formServ[id].importo = costoServizio(def, n, persone);
        formServ[id].prezzo = def.prezzo; // servono per il dettaglio nel riepilogo PDF
        formServ[id].unita = def.unita;
      }
      extra += formServ[id].importo || 0;
    }
    extra = round2(extra);
    for (const el of $$('[data-cost]', form)) {
      const id = el.dataset.cost, def = servDef(id, casaId), on = formServ[id];
      el.textContent = on
        ? (def ? `${money(def.prezzo)} ${UNITS[def.unita]} → ${money(on.importo)}` : money(on.importo))
        : (def && def.prezzo ? `${money(def.prezzo)} ${UNITS[def.unita]}` : '');
    }

    const prezzo = parseNum(f.prezzo.value);
    const calcolato = round2((prezzo || 0) * Math.max(n, 0) + extra);
    if (source === 'totale') totaleManuale = f.totale.value.trim() !== '' && round2(parseNum(f.totale.value)) !== calcolato;
    if (!totaleManuale && source !== undefined && source !== 'totale') f.totale.value = calcolato > 0 ? numToInput(calcolato) : '';
    const totale = parseNum(f.totale.value) || 0;
    const formula = `${n > 0 ? n : 0} ${n === 1 ? 'notte' : 'notti'} × ${money(prezzo || 0)}${extra ? ` + servizi ${money(extra)}` : ''}`;
    $('#totale-hint').innerHTML = totaleManuale
      ? `Totale inserito a mano. <button type="button" class="link small" id="btn-ricalc" style="font-size:13px">Ricalcola (${formula} = ${money(calcolato)})</button>`
      : (calcolato > 0 ? formula : '');
    const rb = $('#btn-ricalc');
    if (rb) rb.onclick = () => { totaleManuale = false; recalc('prezzo'); };

    $('#row-acconto').hidden = !f.haAcconto.checked;
    const acconto = f.haAcconto.checked ? parseNum(f.acconto.value) || 0 : 0;
    $('#saldo').textContent = money(totale - acconto);

    $('#box-proprietario').hidden = !f.haProprietario.checked;
    const perc = parseNum(f.quotaPerc.value);
    if (source === 'quotaProprietario') f.quotaPerc.value = '';
    else if (perc > 0 && (source === 'quotaPerc' || source === 'prezzo' || source === 'totale' || source === 'date')) {
      f.quotaProprietario.value = numToInput(round2(totale * perc / 100));
    }
    if (perc > 0 && (source === 'servizi' || source === 'persone')) f.quotaProprietario.value = numToInput(round2(totale * perc / 100));
    const quota = f.haProprietario.checked ? parseNum(f.quotaProprietario.value) || 0 : 0;
    $('#guadagno').textContent = money(totale - quota);

    if (source === 'date' && !colorePicked && n > 0) { colore = autoColor(f.arrivo.value, f.partenza.value, editing?.id); renderColors(); }
  }

  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (!name || name === 'casaId') return;
    if (name === 'arrivo' || name === 'partenza') {
      // se l'arrivo supera la partenza, sposta la partenza al giorno dopo
      const f = form.elements;
      if (name === 'arrivo' && f.arrivo.value && (!f.partenza.value || f.partenza.value <= f.arrivo.value)) f.partenza.value = addDays(f.arrivo.value, 1);
      recalc('date');
    } else recalc(name);
  });
  form.addEventListener('change', (e) => {
    if (e.target.dataset.serv) {
      const id = e.target.dataset.serv;
      if (e.target.checked) formServ[id] = { nome: (servizi.find((s) => s.id === id) || {}).nome || id, importo: null };
      else delete formServ[id];
      recalc('servizi');
    } else if (e.target.type === 'checkbox') recalc(e.target.name);
  });

  $$('.stepper button').forEach((b) => b.addEventListener('click', () => {
    const inp = form.elements.persone;
    inp.value = Math.max(1, (parseInt(inp.value, 10) || 0) + Number(b.dataset.step));
    recalc('persone');
  }));

  // Interruttori dei servizi (quelli del listino + eventuali servizi non più in listino salvati nella prenotazione)
  let formServ = {};
  function renderServiziForm() {
    const rows = [
      ...servizi.map((s) => ({ id: s.id, nome: s.nome })),
      ...Object.keys(formServ).filter((k) => !servizi.some((s) => s.id === k)).map((k) => ({ id: k, nome: formServ[k].nome })),
    ];
    $('#servizi-group').innerHTML = rows.length
      ? rows.map((r) => `<label class="row switch-row"><span>${esc(r.nome)}<small class="sv-cost" data-cost="${r.id}"></small></span><input type="checkbox" class="switch" data-serv="${r.id}" ${formServ[r.id] ? 'checked' : ''}></label>`).join('')
      : '<div class="row info small">Nessun servizio: aggiungili dal menu Prezzi.</div>';
  }

  $('#btn-cancel').addEventListener('click', closeForm);

  $('#btn-delete').addEventListener('click', () => {
    if (!editing) return;
    if (!confirm(`Eliminare la prenotazione di ${editing.nome}?\nL'operazione non si può annullare.`)) return;
    bookings = bookings.filter((b) => b.id !== editing.id);
    save(); closeForm(); render(); toast('Prenotazione eliminata');
  });

  // Valida e salva la prenotazione del modulo; restituisce la prenotazione salvata o null
  function saveForm() {
    const f = form.elements;
    $$('input, select', form).forEach((i) => i.classList.remove('invalid'));
    const errors = [];
    const bad = (el, msg) => { el.classList.add('invalid'); errors.push(msg); };

    if (!houses.some((h) => h.id === f.casaId.value)) bad(f.casaId, 'Scegli la casa.');
    const nome = f.nome.value.trim();
    if (!nome) bad(f.nome, 'Inserisci il nome.');
    const n = nightsBetween(f.arrivo.value, f.partenza.value);
    if (!f.arrivo.value || !f.partenza.value) bad(f.arrivo, 'Inserisci le date di arrivo e partenza.');
    else if (n <= 0) bad(f.partenza, 'La partenza deve essere dopo l\'arrivo.');
    const persone = parseInt(f.persone.value, 10);
    if (!(persone >= 1)) bad(f.persone, 'Numero di persone non valido.');
    const nums = {};
    for (const k of ['prezzo', 'totale', 'acconto', 'quotaPerc', 'quotaProprietario']) {
      const v = parseNum(f[k].value);
      if (Number.isNaN(v) || v < 0) bad(f[k], `Valore non valido: ${f[k].closest('.row').querySelector('span').textContent}`);
      nums[k] = round2(v || 0);
    }
    if (f.haProprietario.checked && !f.proprietario.value.trim()) bad(f.proprietario, 'Inserisci il nome del proprietario.');
    if (errors.length) { alert(errors.join('\n')); return null; }

    const rec = {
      id: editing ? editing.id : uid(),
      casaId: f.casaId.value,
      nome, telefono: f.telefono.value.trim(),
      colore,
      arrivo: f.arrivo.value, partenza: f.partenza.value,
      persone,
      servizi: JSON.parse(JSON.stringify(formServ)),
      prezzo: nums.prezzo, totale: nums.totale, totaleManuale,
      haAcconto: f.haAcconto.checked, acconto: f.haAcconto.checked ? nums.acconto : 0,
      haProprietario: f.haProprietario.checked,
      proprietario: f.haProprietario.checked ? f.proprietario.value.trim() : '',
      quotaPerc: f.haProprietario.checked ? nums.quotaPerc : 0,
      quotaProprietario: f.haProprietario.checked ? nums.quotaProprietario : 0,
      proprietarioPagato: f.haProprietario.checked && f.proprietarioPagato.checked,
      note: f.note.value.trim(),
      creato: editing ? editing.creato : new Date().toISOString(),
      modificato: new Date().toISOString(),
    };

    // Avviso sovrapposizioni nella stessa casa
    const clash = bookings.filter((b) => b.id !== rec.id && b.casaId === rec.casaId && b.arrivo < rec.partenza && rec.arrivo < b.partenza);
    if (clash.length) {
      const list = clash.map((b) => `• ${b.nome}: ${fmtShort.format(asDate(b.arrivo))} → ${fmtShort.format(asDate(b.partenza))}`).join('\n');
      if (!confirm(`Attenzione: "${houseName(rec)}" è già prenotata in queste date:\n${list}\n\nSalvare comunque?`)) return null;
    }

    if (editing) bookings = bookings.map((b) => (b.id === rec.id ? rec : b));
    else bookings.push(rec);
    save();
    editing = rec;
    return rec;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const wasEditing = !!editing;
    const rec = saveForm();
    if (!rec) return;
    closeForm();
    if (state.view === 'calendario') { state.calSel = rec.arrivo; state.calMonth = rec.arrivo.slice(0, 7); }
    render(); toast(wasEditing ? 'Modifiche salvate' : 'Prenotazione salvata');
  });

  // Salva e crea il riepilogo PDF per il cliente
  $('#btn-pdf').addEventListener('click', () => {
    const rec = saveForm();
    if (!rec) return;
    $('#form-title').textContent = 'Modifica prenotazione';
    $('#btn-delete').hidden = false;
    render();
    try {
      const bytes = buildRiepilogo(rec);
      const safe = rec.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente';
      download(`Riepilogo-${safe}-${rec.arrivo}.pdf`, bytes, 'application/pdf');
    } catch (err) {
      alert('Impossibile creare il PDF: ' + err.message);
    }
  });

  // ---------- Modulo casa ----------
  const formCasa = $('#form-casa');
  const sheetCasa = $('#sheet-casa');
  let editingCasa = null;

  function openCasa(h) {
    editingCasa = h || null;
    fillOwnersList();
    formCasa.reset();
    const f = formCasa.elements;
    f.nome.value = h?.nome || '';
    f.haProprietario.checked = !!h?.haProprietario;
    f.proprietario.value = h?.proprietario || '';
    f.quotaPerc.value = numToInput(h?.quotaPerc);
    f.prezzo.value = numToInput(h?.prezzo);
    f.note.value = h?.note || '';
    $('#casa-box-prop').hidden = !f.haProprietario.checked;
    $('#casa-title').textContent = h ? 'Modifica casa' : 'Nuova casa';
    $('#casa-delete').hidden = !h;
    openSheet(sheetCasa);
    if (!h) setTimeout(() => f.nome.focus(), 250);
  }
  formCasa.elements.haProprietario.addEventListener('change', (e) => { $('#casa-box-prop').hidden = !e.target.checked; });
  $('#casa-cancel').addEventListener('click', () => closeSheet(sheetCasa));

  formCasa.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formCasa.elements;
    const nome = f.nome.value.trim();
    const perc = parseNum(f.quotaPerc.value);
    const prezzoCasa = parseNum(f.prezzo.value);
    const errors = [];
    if (!nome) errors.push('Inserisci il nome della casa.');
    if (Number.isNaN(prezzoCasa) || prezzoCasa < 0) errors.push('Prezzo a notte non valido.');
    if (houses.some((h) => h.id !== editingCasa?.id && h.nome.toLowerCase() === nome.toLowerCase())) errors.push('Esiste già una casa con questo nome.');
    if (f.haProprietario.checked && !f.proprietario.value.trim()) errors.push('Inserisci il nome del proprietario.');
    if (Number.isNaN(perc) || perc < 0 || perc > 100) errors.push('Quota % non valida (0–100).');
    if (errors.length) { alert(errors.join('\n')); return; }
    const rec = {
      id: editingCasa?.id || uid(),
      nome,
      prezzo: round2(prezzoCasa || 0),
      prezziServizi: editingCasa?.prezziServizi || {},
      haProprietario: f.haProprietario.checked,
      proprietario: f.haProprietario.checked ? f.proprietario.value.trim() : '',
      quotaPerc: f.haProprietario.checked ? round2(perc || 0) : 0,
      note: f.note.value.trim(),
    };
    if (editingCasa) houses = houses.map((h) => (h.id === rec.id ? rec : h));
    else houses.push(rec);
    save(); closeSheet(sheetCasa); render();
    toast(editingCasa ? 'Casa aggiornata' : 'Casa aggiunta');
  });

  $('#casa-delete').addEventListener('click', () => {
    if (!editingCasa) return;
    const n = bookings.filter((b) => b.casaId === editingCasa.id).length;
    if (n) { alert(`Non puoi eliminare "${editingCasa.nome}": ci sono ${n} prenotazioni collegate.\nElimina o sposta prima le prenotazioni.`); return; }
    if (!confirm(`Eliminare la casa "${editingCasa.nome}"?`)) return;
    houses = houses.filter((h) => h.id !== editingCasa.id);
    save(); closeSheet(sheetCasa); render(); toast('Casa eliminata');
  });

  // ---------- Riepilogo PDF per il cliente ----------
  // Non contiene dati interni (proprietario, quote, note).
  function servDetail(s, n, p) {
    if (!s.importo) return 'incluso';
    if (s.prezzo == null) return '';
    const pr = money(s.prezzo);
    const nt = `${n} ${n === 1 ? 'notte' : 'notti'}`;
    const ps = `${p} ${p === 1 ? 'persona' : 'persone'}`;
    return { soggiorno: `${pr} a soggiorno`, notte: `${nt} × ${pr}`, persona: `${ps} × ${pr}`, personaNotte: `${ps} × ${nt} × ${pr}` }[s.unita] || '';
  }

  function buildRiepilogo(b) {
    const pdf = new window.MiniPDF();
    const L = 50, R = pdf.W - 50;
    const ACC = '#2f6f5e', GREY = '#6e6e73', LINE = '#d9d9de', SOFT = '#eef5f2';
    const n = nightsBetween(b.arrivo, b.partenza);
    const fmtData = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const fit = (str, maxW, size, bold) => {
      let s = String(str ?? '');
      if (pdf.textWidth(s, size, bold) <= maxW) return s;
      while (s.length && pdf.textWidth(s + '…', size, bold) > maxW) s = s.slice(0, -1);
      return s + '…';
    };

    // Intestazione
    pdf.rect(0, 0, pdf.W, 8, { fill: ACC });
    let y = 62;
    pdf.text(L, y, fit(struttura.nome || 'Riepilogo soggiorno', 300, 18, true), { size: 18, bold: true, color: ACC });
    y += 18;
    for (const t of [struttura.indirizzo, [struttura.telefono, struttura.email].filter(Boolean).join(' · ')].filter(Boolean)) {
      pdf.text(L, y, fit(t, 300, 9), { size: 9, color: GREY }); y += 12;
    }
    pdf.text(R, 62, 'RIEPILOGO SOGGIORNO', { size: 11, bold: true, align: 'right' });
    pdf.text(R, 78, `Data: ${new Date().toLocaleDateString('it-IT')}`, { size: 9, color: GREY, align: 'right' });
    y = Math.max(y, 90) + 10;
    pdf.line(L, y, R, y, { color: LINE });
    y += 26;

    // Dati del soggiorno, su due colonne
    const info = [['Ospite', b.nome], ['Alloggio', houseName(b)], ['Arrivo', fmtData.format(asDate(b.arrivo))], ['Partenza', fmtData.format(asDate(b.partenza))], ['Notti', String(n)], ['Persone', String(b.persone)]];
    const colW = (R - L) / 2;
    info.forEach(([k, v], i) => {
      const x = L + (i % 2) * colW, yy = y + Math.floor(i / 2) * 32;
      pdf.text(x, yy, k.toUpperCase(), { size: 7.5, bold: true, color: GREY });
      pdf.text(x, yy + 14, fit(v, colW - 16, 11), { size: 11 });
    });
    y += Math.ceil(info.length / 2) * 32 + 16;

    // Tabella delle spese
    const cDesc = L + 10, cDet = L + 165, cAmt = R - 10;
    pdf.rect(L, y, R - L, 22, { fill: SOFT });
    pdf.text(cDesc, y + 15, 'Descrizione', { size: 9, bold: true, color: ACC });
    pdf.text(cDet, y + 15, 'Dettaglio', { size: 9, bold: true, color: ACC });
    pdf.text(cAmt, y + 15, 'Importo', { size: 9, bold: true, color: ACC, align: 'right' });
    y += 22;
    const row = (desc, det, amt) => {
      if (y > pdf.H - 220) { pdf.addPage(); y = 60; }
      y += 19;
      pdf.text(cDesc, y, fit(desc, cDet - cDesc - 10, 10), { size: 10 });
      pdf.text(cDet, y, fit(det, cAmt - cDet - 85, 9), { size: 9, color: GREY });
      pdf.text(cAmt, y, money(amt), { size: 10, align: 'right' });
      y += 9;
      pdf.line(L, y, R, y, { color: LINE, width: 0.4 });
    };

    const sv = Object.values(b.servizi || {});
    const totServ = round2(sv.reduce((a, s) => a + (s.importo || 0), 0));
    const nt = `${n} ${n === 1 ? 'notte' : 'notti'}`;
    const pernott = b.prezzo > 0 ? round2(b.prezzo * n) : round2((b.totale || 0) - totServ);
    if (b.prezzo > 0) row('Pernottamento', `${nt} × ${money(b.prezzo)}`, pernott);
    else row('Soggiorno', nt, pernott);
    for (const s of sv) row(s.nome, servDetail(s, n, b.persone), s.importo || 0);
    const diff = round2((b.totale || 0) - pernott - totServ);
    if (Math.abs(diff) >= 0.01) row(diff < 0 ? 'Sconto' : 'Altri costi', '', diff);

    // Totali
    y += 26;
    const tx = R - 200;
    const tot = (label, val, { bold = false, size = 10, color = [0, 0, 0] } = {}) => {
      pdf.text(tx, y, label, { size, bold, color });
      pdf.text(cAmt, y, money(val), { size, bold, color, align: 'right' });
      y += size + 10;
    };
    tot('Totale soggiorno', b.totale, { bold: true, size: 12 });
    if (b.haAcconto && b.acconto) {
      tot('Acconto già versato', -b.acconto, { color: GREY });
      pdf.rect(tx - 10, y - 14, R - tx + 10, 26, { fill: SOFT });
      y += 4;
      tot('Da saldare', saldo(b), { bold: true, size: 12, color: ACC });
    }

    // Testo finale e avviso
    if (struttura.piede) {
      y += 20;
      for (const ln of pdf.wrap(struttura.piede, R - L, 9.5)) {
        if (y > pdf.H - 60) { pdf.addPage(); y = 60; }
        pdf.text(L, y, ln, { size: 9.5 }); y += 13;
      }
    }
    pdf.text(pdf.W / 2, pdf.H - 36, 'Documento riepilogativo, non valido ai fini fiscali.', { size: 8, color: GREY, align: 'center' });

    return pdf.output(`Riepilogo soggiorno - ${b.nome}`);
  }

  // ---------- Backup ----------
  function download(name, content, type, onDone = () => {}) {
    const blob = new Blob([content], { type });
    const file = new File([blob], name, { type });
    // Su iPhone il foglio di condivisione permette di salvare in File, inviare via WhatsApp o mail, ecc.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(onDone).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    onDone();
  }
  function markBackup() { localStorage.setItem(STORE_KEY + '.backupAt', new Date().toISOString()); if (state.view === 'conti') render(); }

  function exportJSON() {
    const data = { app: 'agenda-beb', versione: 2, esportato: new Date().toISOString(), struttura, servizi, case: houses, prenotazioni: bookings };
    download(`backup-agenda-beb-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json', markBackup);
  }

  function exportCSV() {
    const cols = [
      ['Casa', houseName], ['Nome', (b) => b.nome], ['Telefono', (b) => b.telefono],
      ['Arrivo', (b) => b.arrivo], ['Partenza', (b) => b.partenza], ['Notti', (b) => nightsBetween(b.arrivo, b.partenza)],
      ['Persone', (b) => b.persone],
      ...servizi.map((s) => [s.nome, (b) => (b.servizi?.[s.id] ? (b.servizi[s.id].importo || 'Sì') : 'No')]),
      ['Spesa giornaliera', (b) => b.prezzo],
      ['Totale servizi', (b) => round2(Object.values(b.servizi || {}).reduce((a, x) => a + (x.importo || 0), 0))],
      ['Totale', (b) => b.totale],
      ['Acconto', (b) => (b.haAcconto ? b.acconto : 0)], ['Da saldare', saldo],
      ['Proprietario', (b) => b.proprietario], ['Quota proprietario', quotaProp], ['Pagato al proprietario', (b) => (b.haProprietario ? (b.proprietarioPagato ? 'Sì' : 'No') : '')],
      ['Resta a noi', nostro], ['Note', (b) => b.note],
    ];
    const cell = (v) => {
      if (typeof v === 'number') return String(v).replace('.', ',');
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [cols.map((c) => c[0]).join(';')];
    [...bookings].sort((a, b) => a.arrivo.localeCompare(b.arrivo)).forEach((b) => rows.push(cols.map((c) => cell(c[1](b))).join(';')));
    download(`prenotazioni-beb-${todayISO()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv', markBackup);
  }

  function importJSON(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = Array.isArray(data) ? data : data.prenotazioni;
        const hs = Array.isArray(data.case) ? data.case : [];
        if (!Array.isArray(arr) || arr.some((b) => !b || !b.id || !b.arrivo || !b.partenza)) throw new Error('File non riconosciuto');
        if (hs.some((h) => !h || !h.id || !h.nome)) throw new Error('Elenco case non valido');
        if (!confirm(`Il backup contiene ${arr.length} prenotazioni e ${hs.length} case.\nSostituire i dati attuali (${bookings.length} prenotazioni, ${houses.length} case)?`)) return;
        bookings = arr; houses = hs;
        if (Array.isArray(data.servizi)) servizi = data.servizi;
        if (data.struttura && typeof data.struttura === 'object') struttura = { ...struttura, ...data.struttura };
        migrate(); save(); render(); toast('Backup ripristinato');
      } catch (err) {
        alert('Impossibile leggere il backup: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------- Varie ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  // Aggiorna "oggi" se l'app resta aperta a cavallo della mezzanotte
  document.addEventListener('visibilitychange', () => { if (!document.hidden && sheet.hidden && sheetCasa.hidden) render(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
})();
