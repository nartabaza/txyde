/* ==========================================================================
   Data checks (/quality/ and its three pages): what every page shares.

   Loads the checks from the "Data checks" tab of the archive sheet through the Apps Script web
   app (data-endpoint) and saves decisions back. Each check row is one possible change to one cell
   of the Main tab; a decision is "change" (with the final value), "keep" or "reject" (a reading
   that is not on the photo). With no endpoint set, the pages run on assets/quality/sample.json and
   keep decisions in this browser only (demo mode).

   The start page (data-page="hub") shows the counts; the other pages register a renderer with
   Quality.start(page, render) and get the rows of their page.
   ========================================================================== */
window.Quality = (() => {
  const root = document.querySelector('.quality');
  if (!root) return null;

  const base = root.dataset.base || '';
  // ?demo runs on the sample data even when the sheet is linked: to try the pages out, or before
  // the Apps Script with Checks.gs is deployed. Links between the pages keep it (the bar at the top: review-nav.js).
  const forceDemo = new URLSearchParams(location.search).has('demo');
  const endpoint = forceDemo ? '' : root.dataset.endpoint || '';
  const demo = !endpoint;
  if (forceDemo) {
    document.querySelectorAll('.q-hub__card').forEach((a) => { a.href += (a.href.includes('?') ? '&' : '?') + 'demo'; });
  }
  const KEY_STORE = 'txyde-review-key'; // the same key as the description review
  const DEMO_STORE = 'txyde-quality-demo';

  const $ = (sel, el = root) => el.querySelector(sel);
  const message = $('.review__message');
  const keyForm = $('.review__key');

  const store = {
    get(name, fallback) {
      try { const v = localStorage.getItem(name); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(name, value) {
      try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* not kept; fine */ }
    },
  };

  function say(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  // ---- Small DOM helper: h('div.class', {attrs}, ...children) ----------------------
  function h(tag, attrs, ...children) {
    const [name, ...classes] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (classes.length) el.className = classes.join(' ');
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat().filter((c) => c != null && c !== false));
    return el;
  }

  // Arabic (or other right-to-left) runs inside English text go in <bdi>, so quotes, dashes and
  // numbers around them stay in order.
  const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿](?:[֐-ࣿיִ-﷿ﹰ-﻿٠-٩\d\s\-–.,:;+/]*[֐-ࣿיִ-﷿ﹰ-﻿٠-٩])?/g;
  function isolateRtl(text) {
    const parts = [];
    let last = 0;
    for (const m of String(text).matchAll(RTL)) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(h('bdi', {}, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  const src = (url) => (url && url.startsWith('/') ? base + url : url || '');

  // A small photo that opens the full image. Falls back to the full image if the thumbnail is missing.
  function thumb(row, size = 'small') {
    const img = h('img', { src: src(row.thumbUrl || row.imageUrl), alt: row.title || `Photo ${row.id}`, loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => { if (row.imageUrl && img.src !== src(row.imageUrl)) img.src = src(row.imageUrl); }, { once: true });
    return h(`a.q-thumb.q-thumb--${size}`, { href: src(row.imageUrl), target: '_blank', rel: 'noopener', title: `#${row.id} ${row.title || ''}\nOpen the full image` }, img);
  }

  function pill(kind, label, active, onClick, attrs = {}) {
    return h(`button.filter-button.filter-button--${kind}${active ? '.is-active' : ''}`, { type: 'button', onclick: onClick, ...attrs }, label);
  }

  // ---- Loading and saving -------------------------------------------------------------

  let rows = [];
  let records = {}; // photo id -> { label: value }, a snapshot of the record (spelling page)

  async function load(page) {
    say('Loading…');
    try {
      if (demo) {
        const res = await fetch(`${base}/assets/quality/sample.json`, { cache: 'no-store' });
        const data = await res.json();
        rows = data.checks;
        records = data.records || {};
        const saved = store.get(DEMO_STORE, {});
        rows.forEach((r) => Object.assign(r, saved[r.key] || {}));
      } else {
        const key = store.get(KEY_STORE, '');
        if (!key) return askKey(false, page);
        const res = await fetch(`${endpoint}?action=checks&key=${encodeURIComponent(key)}`);
        const data = await res.json();
        if (!data.ok) {
          if (/key/i.test(data.error)) return askKey(true, page);
          throw new Error(data.error);
        }
        rows = data.checks;
        records = data.records || {};
      }
    } catch (err) {
      say(`The checks could not be loaded (${err.message}). Please reload the page.`);
      return null;
    }
    rows.forEach((r) => {
      r.id = String(r.id);
      r.decision = r.decision || '';
      r.options = typeof r.options === 'string' ? r.options.split('|').filter(Boolean) : r.options || [];
      try { r.context = typeof r.context === 'string' ? JSON.parse(r.context || '{}') : r.context || {}; } catch { r.context = {}; }
    });
    say(demo ? 'Demo mode: these are the checks found in the latest export, and decisions are kept in this browser only.' : '');
    return page ? rows.filter((r) => r.page === page) : rows;
  }

  let pending = null;
  function askKey(wrong, page) {
    say('');
    keyForm.hidden = false;
    $('.review__key-error').hidden = !wrong;
    $('#review-key').focus();
    pending = page;
    return null;
  }
  keyForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    store.set(KEY_STORE, $('#review-key').value.trim());
    keyForm.hidden = true;
    begin();
  });

  /** Saves decisions for several rows at once: [{ row, decision, final, note }]. */
  async function save(list) {
    const decisions = list.map(({ row, decision, final = '', note = '' }) => ({ key: row.key, decision, final, note }));
    if (demo) {
      const saved = store.get(DEMO_STORE, {});
      decisions.forEach((d) => { saved[d.key] = { decision: d.decision, final: d.final, note: d.note }; });
      store.set(DEMO_STORE, saved);
    } else {
      const res = await fetch(endpoint, {
        method: 'POST', // sent as text/plain, which Apps Script accepts without a CORS preflight
        body: JSON.stringify({ key: store.get(KEY_STORE, ''), action: 'saveChecks', decisions }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      if (data.missing?.length) throw new Error(`${data.missing.length} checks are no longer in the sheet; reload the page`);
    }
    list.forEach(({ row, decision, final = '', note = '' }) => Object.assign(row, { decision, final: decision ? final : '', note: decision ? note : '' }));
  }

  /** Rows grouped by their check, in first-seen order. */
  function groups(list) {
    const map = new Map();
    list.forEach((r) => { if (!map.has(r.check)) map.set(r.check, []); map.get(r.check).push(r); });
    return [...map.entries()].map(([id, items]) => ({ id, rows: items, first: items[0] }));
  }

  // ---- A photo's record, to weigh one record against another --------------------------

  const LONG = new Set(['Description', 'Source', 'Keywords']);

  /** The record of the row's photo as a list of fields, with `mark` highlighted wherever it appears.
      The row's own cell comes first, under its column name, when the record does not show it. */
  function record(row, mark) {
    const rec = records[row.id] || {};
    const fields = Object.entries(rec);
    const shown = new Set(Object.values(rec));
    if (row.current && !shown.has(row.current)) fields.unshift([row.column.replace(/ \(.*$/, ''), row.current]);
    if (!fields.length) return h('p.q-record__none', 'No more details for this photo.');
    return h('dl.q-record', fields.map(([label, value]) =>
      h(`div.q-record__field${LONG.has(label) ? '.q-record__field--long' : ''}`,
        h('dt', label), h('dd', { dir: 'auto' }, marked(value, mark)))));
  }

  // `mark` as a whole word, so Shapsug is not marked inside Shapsugh.
  function marked(text, mark) {
    if (!mark) return isolateRtl(text);
    const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const word = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
    const m = word.exec(text);
    if (!m) return isolateRtl(text);
    return [...isolateRtl(text.slice(0, m.index)), h('mark', mark), ...marked(text.slice(m.index + mark.length), mark)];
  }

  // ---- Progress bar shared by the pages ------------------------------------------------

  function progress(done, total, text) {
    $('.review__progress-text').textContent = text || `${done} of ${total} settled`;
    $('.review__progress-bar span').style.width = `${total ? (100 * done) / total : 0}%`;
  }

  // ---- Start ----------------------------------------------------------------------------

  let started = null;
  async function begin() {
    if (!started) return;
    const list = await load(started.page);
    if (!list) return;
    $('.review__panel') && ($('.review__panel').hidden = false);
    started.render(list);
  }
  function start(page, render) {
    started = { page, render };
    begin();
  }

  // The start page: counts per page.
  if (root.dataset.page === 'hub') {
    start('', (all) => {
      root.querySelectorAll('[data-count]').forEach((card) => {
        const page = card.dataset.count;
        const list = all.filter((r) => r.page === page);
        const gs = groups(list);
        const done = gs.filter((g) => g.rows.every((r) => r.decision)).length;
        $('.q-hub__number', card).textContent = gs.length - done;
        $('.q-hub__meta', card).textContent = `${done} of ${gs.length} settled · ${new Set(list.map((r) => r.id)).size} photos`;
        $('.review__progress-bar span', card).style.width = `${gs.length ? (100 * done) / gs.length : 0}%`;
      });
    });
  }

  return { root, demo, $, h, pill, thumb, isolateRtl, save, groups, progress, say, start, src, record, marked, hasRecord: (id) => Boolean(records[id]) };
})();
