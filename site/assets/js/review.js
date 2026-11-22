/* ==========================================================================
   Description review page (/review/)

   Shows each drafted description beside its photo. The researcher approves it, edits it and
   approves, or rejects it. Each decision goes to the Review tab of the archive sheet through the
   Apps Script web app (data-endpoint). With no endpoint set, the page runs on the sample batch and
   keeps decisions in this browser only (demo mode).
   ========================================================================== */
(() => {
  const root = document.querySelector('.review');
  if (!root) return;

  const endpoint = root.dataset.endpoint || '';
  const base = root.dataset.base || '';
  const demo = !endpoint;

  const KEY_STORE = 'txyde-review-key';
  const DEMO_STORE = 'txyde-review-demo';
  const UNSAVED_STORE = 'txyde-review-unsaved';
  const REASONS = [
    'Invented a fact', 'Wrong date or place', 'Wrong people or names', 'Missed something visible',
    'Added what I know', 'Too long', 'Too short', 'Wording or style',
  ];
  const SHOW = [['todo', 'To review'], ['done', 'Reviewed'], ['all', 'All']];
  const STATUS_LABEL = { '': 'To review', approved: 'Approved', edited: 'Edited and approved', rejected: 'Rejected' };
  const META = [
    ['period', 'Period'], ['dateTaken', 'Date taken'], ['dateType', 'Date type'], ['photographer', 'Photographer'],
    ['creator', 'Creator'], ['location', 'Location'], ['country', 'Country'],
    ['region', 'Region'], ['locality', 'Locality'], ['sublocality', 'Sub-locality'],
  ];

  const $ = (sel, el = root) => el.querySelector(sel);
  const list = $('.review__list');
  const panel = $('.review__panel');
  const message = $('.review__message');
  const keyForm = $('.review__key');
  const template = document.getElementById('review-card');

  let items = [];
  let batch = '';
  let show = 'todo';

  // ---- Storage (may be unavailable in private windows) ----------------------

  const store = {
    get(name, fallback) {
      try { const v = localStorage.getItem(name); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(name, value) {
      try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* not kept; fine */ }
    },
  };
  const itemKey = (item) => `${item.batch}|${item.id}`;
  const unsaved = () => store.get(UNSAVED_STORE, {});
  function keepUnsaved(item, text) {
    const all = unsaved();
    if (text == null) delete all[itemKey(item)]; else all[itemKey(item)] = text;
    store.set(UNSAVED_STORE, all);
  }

  // ---- Loading -----------------------------------------------------------------

  function say(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  async function load() {
    say('Loading…');
    try {
      if (demo) {
        const res = await fetch(`${base}/assets/review/sample.json`, { cache: 'no-store' });
        items = (await res.json()).items;
        const saved = store.get(DEMO_STORE, {});
        items.forEach((item) => Object.assign(item, saved[itemKey(item)] || {}));
      } else {
        const key = store.get(KEY_STORE, '');
        if (!key) return askKey(false);
        const res = await fetch(`${endpoint}?action=items&key=${encodeURIComponent(key)}`);
        const data = await res.json();
        if (!data.ok) {
          if (/key/i.test(data.error)) return askKey(true);
          throw new Error(data.error);
        }
        items = data.items;
      }
    } catch (err) {
      say(`The drafts could not be loaded (${err.message}). Please reload the page.`);
      return;
    }
    items.forEach((item) => {
      item.id = String(item.id);
      item.status = item.status || '';
      item.reasons = item.reasons || [];
      item.checks = (item.checks || []).filter(Boolean);
    });
    const batches = [...new Set(items.map((i) => i.batch))];
    // Open the latest batch that still has drafts to review.
    batch = [...batches].reverse().find((b) => items.some((i) => i.batch === b && !i.status)) || batches.at(-1) || '';
    say(demo ? 'Demo mode: these are sample drafts, and decisions are kept in this browser only.' : '');
    if (!items.length) say('There are no drafts to review yet.');
    panel.hidden = !items.length;
    render();
  }

  function askKey(wrong) {
    say('');
    keyForm.hidden = false;
    $('.review__key-error').hidden = !wrong;
    $('#review-key').focus();
  }

  keyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    store.set(KEY_STORE, $('#review-key').value.trim());
    keyForm.hidden = true;
    load();
  });

  // ---- Rendering ---------------------------------------------------------------

  const inBatch = () => items.filter((i) => i.batch === batch);
  const visible = (item) => show === 'all' || (show === 'todo' ? !item.status : Boolean(item.status));

  function pill(kind, label, active, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button filter-button--${kind}${active ? ' is-active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function renderPanel() {
    const batches = [...new Set(items.map((i) => i.batch))];
    $('[data-batches]').replaceChildren(...batches.map((b) => {
      const all = items.filter((i) => i.batch === b);
      const done = all.filter((i) => i.status).length;
      return pill('primary', `${b} (${done}/${all.length})`, b === batch, () => { batch = b; render(); });
    }));
    $('[data-show]').replaceChildren(...SHOW.map(([value, label]) =>
      pill('tag', label, value === show, () => { show = value; render(); })));
    renderProgress();
  }

  function renderProgress() {
    const all = inBatch();
    const count = (s) => all.filter((i) => i.status === s).length;
    const done = all.filter((i) => i.status).length;
    $('.review__progress-text').textContent = `${done} of ${all.length} reviewed: ${count('approved')} approved as drafted, ` +
      `${count('edited')} edited, ${count('rejected')} rejected`;
    $('.review__progress-bar span').style.width = `${all.length ? (100 * done) / all.length : 0}%`;
  }

  function render() {
    renderPanel();
    const shown = inBatch().filter(visible);
    list.replaceChildren(...shown.map(card));
    if (!shown.length && items.length) {
      const p = document.createElement('p');
      p.className = 'review__empty';
      p.textContent = show === 'todo' ? 'Everything in this batch has been reviewed. Thank you!' : 'Nothing to show here.';
      list.append(p);
    }
  }

  function card(item) {
    const el = template.content.firstElementChild.cloneNode(true);
    el.item = item;
    const text = $('.review-card__text', el);

    const src = item.imageUrl && item.imageUrl.startsWith('/') ? base + item.imageUrl : item.imageUrl;
    $('.review-card__media', el).href = src;
    const img = $('.review-card__image', el);
    img.src = src;
    img.alt = item.title;
    $('.review-card__id', el).textContent = `#${item.id}${item.promptVersion ? ` · prompt ${item.promptVersion}` : ''}`;
    $('.review-card__title', el).textContent = item.title;

    $('.review-card__meta', el).replaceChildren(...META.filter(([k]) => item[k] && item[k] !== 'nAn').map(([k, label]) => {
      const row = document.createElement('div');
      row.className = 'viewer__meta-row';
      row.innerHTML = '<dt></dt><dd></dd>';
      row.firstChild.textContent = label;
      row.lastChild.textContent = item[k];
      return row;
    }));
    const keywords = String(item.keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
    const tags = $('.review-card__tags', el);
    tags.hidden = !keywords.length;
    tags.replaceChildren(...keywords.map((k) => Object.assign(document.createElement('li'), { textContent: k })));

    // The researcher's own notes and names: the source of most drafts, folded away to keep cards short.
    const source = [['Names', item.names], ["Researcher's notes", item.notes]].filter(([, v]) => v);
    if (source.length) {
      const box = document.createElement('details');
      box.className = 'review-card__source';
      box.innerHTML = '<summary>Sources for this draft</summary>';
      source.forEach(([label, value]) => {
        const p = document.createElement('p');
        p.innerHTML = '<strong></strong> ';
        p.firstChild.textContent = `${label}:`;
        p.append(value);
        box.append(p);
      });
      tags.after(box);
    }

    const pending = unsaved()[itemKey(item)];
    text.value = pending ?? (item.status && item.status !== 'rejected' ? item.final : item.draft);
    text.addEventListener('input', () => { keepUnsaved(item, text.value); update(el); });

    const checks = $('.review-card__checks', el);
    checks.hidden = !item.checks.length;
    $('ul', checks).replaceChildren(...item.checks.map((c) => Object.assign(document.createElement('li'), { textContent: c })));

    $('.review-card__reasons', el).replaceChildren(...REASONS.map((reason) => {
      const b = pill('tag', reason, item.reasons.includes(reason), () => b.classList.toggle('is-active'));
      b.setAttribute('aria-pressed', String(item.reasons.includes(reason)));
      b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.classList.contains('is-active'))));
      return b;
    }));
    $('.review-card__comment', el).value = item.comment || '';
    if (item.reasons.length || item.comment) $('.review-card__more', el).open = true;

    $('.review-card__approve', el).addEventListener('click', () => decide(el, 'approve'));
    $('.review-card__reject', el).addEventListener('click', () => decide(el, 'reject'));
    $('.review-card__reset', el).addEventListener('click', () => decide(el, 'reset'));
    el.addEventListener('focusin', () => setCurrent(el));
    el.addEventListener('pointerdown', () => setCurrent(el));
    update(el);
    return el;
  }

  // Badge, word count and "edited" mark, from the card's current state.
  function update(el) {
    const { item } = el;
    const text = $('.review-card__text', el).value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    $('.review-card__count', el).textContent = `${words} word${words === 1 ? '' : 's'}`;
    $('.review-card__changed', el).hidden = text.trim() === item.draft.trim();
    const status = $('.review-card__status', el);
    status.textContent = STATUS_LABEL[item.status];
    status.dataset.status = item.status || 'todo';
    el.dataset.status = item.status || 'todo';
  }

  // ---- Decisions -------------------------------------------------------------------

  async function decide(el, action) {
    const { item } = el;
    const textarea = $('.review-card__text', el);
    if (action === 'reset') textarea.value = item.draft;
    const text = textarea.value.trim();
    if (action === 'approve' && !text) {
      $('.review-card__save', el).textContent = 'The description is empty. Write one, or reject the draft.';
      return;
    }
    const status = action === 'reset' ? '' : action === 'reject' ? 'rejected' : text === item.draft.trim() ? 'approved' : 'edited';
    const change = {
      status,
      final: status === 'rejected' || !status ? '' : text,
      reasons: status ? [...el.querySelectorAll('.review-card__reasons .is-active')].map((b) => b.textContent) : [],
      comment: status ? $('.review-card__comment', el).value.trim() : '',
    };
    const note = $('.review-card__save', el);
    note.textContent = 'Saving…';
    try {
      await save(item, change);
    } catch (err) {
      note.textContent = `Not saved (${err.message}). Please try again.`;
      return;
    }
    Object.assign(item, change);
    keepUnsaved(item, null);
    if (!status) {
      el.querySelectorAll('.review-card__reasons .is-active').forEach((b) => b.click());
      $('.review-card__comment', el).value = '';
    }
    note.textContent = status ? 'Saved' : 'Back to the draft';
    update(el);
    renderPanel();
    if (status) move(1, true);
  }

  async function save(item, change) {
    if (demo) {
      const saved = store.get(DEMO_STORE, {});
      saved[itemKey(item)] = change;
      store.set(DEMO_STORE, saved);
      return;
    }
    const res = await fetch(endpoint, {
      method: 'POST', // sent as text/plain, which Apps Script accepts without a CORS preflight
      body: JSON.stringify({ key: store.get(KEY_STORE, ''), action: 'save', batch: item.batch, id: item.id, ...change }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
  }

  // ---- Moving around and keys ---------------------------------------------------------

  let current = null;
  function setCurrent(el) {
    if (current === el) return;
    current?.classList.remove('is-current');
    current = el;
    el.classList.add('is-current');
  }

  const cards = () => [...list.querySelectorAll('.review-card')];

  // Next or previous card; after a decision, the next one still to review.
  function move(step, unreviewedOnly = false) {
    const all = cards();
    if (!all.length) return;
    let i = all.indexOf(current);
    for (let n = 0; n < all.length; n++) {
      i += step;
      if (i < 0 || i >= all.length) return;
      if (!unreviewedOnly || !all[i].item.status) break;
    }
    const el = all[i];
    if (!el) return;
    setCurrent(el);
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  document.addEventListener('keydown', (event) => {
    const typing = /^(TEXTAREA|INPUT)$/.test(event.target.tagName);
    if (typing) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.classList.contains('review-card__text')) {
        event.preventDefault();
        decide(event.target.closest('.review-card'), 'approve');
      } else if (event.key === 'Escape') {
        event.target.blur();
      }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!current && cards().length) setCurrent(cards()[0]);
    const key = event.key.toLowerCase();
    if (key === 'j') move(1);
    else if (key === 'k') move(-1);
    else if (current && key === 'e') { event.preventDefault(); const t = $('.review-card__text', current); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    else if (current && key === 'a') decide(current, 'approve');
    else if (current && key === 'r') decide(current, 'reject');
  });

  load();
})();
