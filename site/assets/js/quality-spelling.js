/* ==========================================================================
   Spelling (/quality-spelling/): one card per name or term written several ways.

   The researcher picks the form to keep (or types another), and every row that uses another
   form changes to it. A row that is really a different person or place can be left out, and
   "These are different" leaves the whole group as it is. "Compare the records" puts the records
   behind each form side by side (date, place, source, description), to judge which is more
   credible before it becomes the standard; each cell in the list can show its record too.

   Capital letters come first, as rules (check ids "caps-..."): one card per rule lists every value
   it changes, and the researcher approves the rule once, unticking the exceptions.
   ========================================================================== */
(() => {
  const Q = window.Quality;
  if (!Q) return;
  const { $, h, pill } = Q;
  const list = $('.q-list');
  const SHOW = [['todo', 'To settle'], ['done', 'Settled'], ['all', 'All']];
  const STRIP = 8; // photos shown per form before "+N"
  const COMPARE = 3; // records shown per form before "Show all"
  let rows = [];
  let show = 'todo';
  let group = 0;

  const settled = (g) => g.rows.every((r) => r.decision);
  const variant = (r) => r.context.variant ?? r.current;

  function render() {
    const gs = Q.groups(rows);
    const done = gs.filter(settled).length;
    Q.progress(done, gs.length, `${done} of ${gs.length} settled · ${rows.filter((r) => r.decision === 'change').length} cells to change`);
    $('[data-show]').replaceChildren(...SHOW.map(([v, label]) => pill('tag', label, v === show, () => { show = v; render(); })));
    const shown = gs.filter((g) => show === 'all' || (show === 'done' ? settled(g) : !settled(g)));
    // Sections, each marked for the section bar (review-nav.js): capital-letter rules, the
    // glossary's spellings, then the other names and terms.
    const fromGlossary = (g) => g.id.startsWith('term-') && g.first.context.glossary;
    const parts = [
      ['caps', 'Capital letters', shown.filter(isCaps), capsCard],
      ['glossary', 'From the glossary', shown.filter((g) => !isCaps(g) && fromGlossary(g)), card],
      ['terms', 'Names and terms', shown.filter((g) => !isCaps(g) && !fromGlossary(g)), card],
    ].filter(([, , part]) => part.length);
    list.replaceChildren(...parts.flatMap(([id, name, part, make]) => [
      h('h2.q-list__heading', { id: `section-${id}`, 'data-toc': name, 'data-toc-count': part.length }, `${name} · ${part.length}`),
      ...part.map(make),
    ]));
    if (!shown.length) list.append(h('p.review__empty', show === 'todo' ? 'Every spelling is settled. Thank you!' : 'Nothing to show here.'));
  }

  function card(g) {
    const { first } = g;
    const name = `form-${group++}`;
    const forms = new Map(); // form -> rows using it
    first.options.forEach((o) => forms.set(o, []));
    g.rows.forEach((r) => { if (!forms.has(variant(r))) forms.set(variant(r), []); forms.get(variant(r)).push(r); });
    const used = [...forms.entries()].filter(([, rs]) => rs.length);
    const typo = used.length === 1; // a fix from terms.json: only the wrong form is in the sheet
    const decided = g.rows.find((r) => r.decision === 'change');
    const chosen = decided ? decided.final : first.proposed;
    const included = new Map(g.rows.map((r) => [r.key, r.decision !== 'keep' || variant(r) === (decided?.final ?? '')]));
    const status = h('span.review-card__save', { 'aria-live': 'polite' });
    const columns = [...new Set(g.rows.map((r) => r.column))];

    // The forms, each with how often it is used and the photos that use it.
    const options = [...forms.entries()].filter(([form, rs]) => rs.length || form === first.proposed).map(([form, rs]) => {
      const photos = [...new Map(rs.map((r) => [r.id, r])).values()];
      const radio = h('input', { type: 'radio', name, value: form, checked: form === chosen });
      return h('label.q-form',
        radio,
        h('span.q-form__text', { dir: 'auto' }, form,
          form === first.context.glossary ? h('span.q-form__glossary', 'In the glossary') : null),
        h('span.q-form__count', rs.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'the fix'),
        h('span.q-form__strip', photos.slice(0, STRIP).map((r) => Q.thumb(r, 'tiny')),
          photos.length > STRIP ? h('span.q-form__more', `+${photos.length - STRIP}`) : null),
      );
    });
    const other = h('input.review__input.q-form__other', { type: 'text', placeholder: 'Another form', value: forms.has(chosen) ? '' : chosen || '' });
    const otherRadio = h('input', { type: 'radio', name, value: '', checked: Boolean(chosen) && !forms.has(chosen), 'aria-label': 'Another form' });
    other.addEventListener('input', () => { otherRadio.checked = true; });

    // Where each form appears, with a box to leave a row out and the record behind it.
    const where = h('details.q-where',
      h('summary', `Show the ${g.rows.length} cells`),
      h('div.q-where__rows', g.rows.map((r) => {
        const box = h('input', { type: 'checkbox', checked: included.get(r.key), 'aria-label': `Include #${r.id}` });
        box.addEventListener('change', () => included.set(r.key, box.checked));
        const more = h('div.q-where__record', { hidden: true });
        const toggle = Q.hasRecord(r.id) ? h('button.q-where__more', {
          type: 'button', 'aria-expanded': 'false',
          onclick: () => {
            const open = more.hidden;
            if (open && !more.firstChild) more.append(Q.record(r, variant(r)));
            more.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.textContent = open ? 'Less' : 'More';
          },
        }, 'More') : null;
        return h('div.q-where__item',
          h('div.q-where__row',
            h('label.q-where__tick', box), Q.thumb(r, 'tiny'),
            h('span.q-where__id', `#${r.id}`),
            h('span.q-where__col', r.column.replace(/ \(.*$/, '')),
            h('span.q-where__text', { dir: 'auto' }, highlight(r.context.snippet || r.current, variant(r))),
            toggle,
          ),
          more,
        );
      })),
    );

    // The records behind each form, side by side, built when first opened.
    const compare = used.length > 1 && g.rows.some((r) => Q.hasRecord(r.id)) ? h('details.q-compare') : null;
    if (compare) {
      compare.append(h('summary', 'Compare the records'));
      compare.addEventListener('toggle', () => {
        if (!compare.open || compare.querySelector('.q-compare__grid')) return;
        compare.append(h('div.q-compare__grid', { style: `--forms: ${used.length}` }, used.map(([form, rs]) => {
          const photos = [...new Map(rs.map((r) => [r.id, r])).values()];
          const card = (r) => {
            const others = [...new Set(g.rows.filter((x) => x.id === r.id).map(variant))].filter((f) => f !== form);
            return h('article.q-compare__record',
              h('header.q-compare__head', Q.thumb(r, 'small'), h('div',
                h('div.q-where__id', `#${r.id}`), h('div.q-row__title', r.title || 'Untitled'),
                others.length ? h('div.q-compare__both', { dir: 'auto' }, `Also uses ${others.join(', ')}`) : null)),
              Q.record(r, form));
          };
          // Records that use only this form first: they show the form's own case.
          photos.sort((a, b) => g.rows.filter((x) => x.id === a.id).length - g.rows.filter((x) => x.id === b.id).length);
          const list = h('div.q-compare__records', photos.slice(0, COMPARE).map(card));
          const rest = photos.slice(COMPARE);
          return h('section.q-compare__form',
            h('h3.q-compare__name', { dir: 'auto' }, form, h('span.q-form__count', ` · ${photos.length} photo${photos.length === 1 ? '' : 's'}`)),
            list,
            rest.length ? pill('tag', `Show all ${photos.length}`, false, (event) => { list.append(...rest.map(card)); event.currentTarget.remove(); }) : null,
          );
        })));
      });
    }

    const pick = () => {
      const radio = [...g.el.querySelectorAll(`input[name="${name}"]`)].find((x) => x.checked);
      return radio ? (radio.value || other.value.trim()) : '';
    };
    const decide = async (different) => {
      const form = different ? '' : pick();
      if (!different && !form) { status.textContent = 'Choose the form to keep first.'; return; }
      const decisions = g.rows.map((row) => {
        const change = !different && variant(row) !== form && included.get(row.key);
        return { row, decision: change ? 'change' : 'keep', final: change ? form : '', note: different ? 'These are different' : '' };
      });
      status.textContent = 'Saving…';
      try { await Q.save(decisions); } catch (err) { status.textContent = `Not saved (${err.message}). Please try again.`; return; }
      render();
    };
    const reopen = async () => {
      status.textContent = 'Saving…';
      try { await Q.save(g.rows.map((row) => ({ row, decision: '' }))); } catch (err) { status.textContent = `Not saved (${err.message}).`; return; }
      render();
    };

    const changes = g.rows.filter((r) => r.decision === 'change').length;
    const summary = !settled(g) ? null : changes
      ? `Settled: ${changes} cell${changes === 1 ? '' : 's'} change to “${decided.final}”.`
      : g.rows.some((r) => r.note === 'These are different') ? 'Settled: these are different, nothing changes.' : 'Settled: nothing changes.';

    g.el = h('section.q-spell',
      h('header.q-rule__head',
        h('div',
          h('h2.q-rule__question', first.question),
          first.hint && h('p.q-rule__hint', first.hint)),
        h('span.q-rule__count', columns.length === 1 ? columns[0].replace(/ \(.*$/, '') : `${columns.length} columns`),
      ),
      h('fieldset.q-forms', h('legend.q-label', typo ? 'Confirm the fix' : 'Keep which form?'),
        options,
        !typo && h('label.q-form.q-form--other', otherRadio, other)),
      compare,
      where,
      h('div.q-rule__actions',
        pill('primary', typo ? 'Fix it everywhere' : 'Use this form everywhere', true, () => decide(false), { 'data-primary': '' }),
        pill('tag', typo ? 'Leave it' : 'These are different', false, () => decide(true)),
        settled(g) && pill('tag', 'Reopen', false, reopen),
        summary && h('span.q-rule__summary', summary),
        status,
      ),
    );
    return g.el;
  }

  // ---- Capital letters: one rule, approved once ----------------------------------------

  const isCaps = (g) => g.id.startsWith('caps-');

  function capsCard(g) {
    const { first } = g;
    const status = h('span.review-card__save', { 'aria-live': 'polite' });
    const columns = [...new Set(g.rows.map((r) => r.column))];
    const photos = new Set(g.rows.map((r) => r.id)).size;

    // One line per distinct value: the same "warrior costume" in 13 photos is one decision.
    const byValue = new Map();
    g.rows.forEach((r) => {
      const k = [r.column, r.current, r.match, r.proposed].join('\u0000');
      if (!byValue.has(k)) byValue.set(k, []);
      byValue.get(k).push(r);
    });
    const lines = [...byValue.values()].map((rs) => capsLine(rs, columns.length > 1));

    const decide = async (apply) => {
      const decisions = [];
      for (const l of lines) {
        const final = l.input.value.trim();
        const base = l.row.op === 'replace' ? l.row.match : l.row.current;
        const change = apply && l.tick.checked && final && final !== base;
        l.rows.forEach((row) => decisions.push({
          row, decision: change ? 'change' : 'keep', final: change ? final : '',
          note: !apply ? 'Not this rule' : change ? '' : 'Exception',
        }));
      }
      status.textContent = 'Saving…';
      try { await Q.save(decisions); } catch (err) { status.textContent = `Not saved (${err.message}). Please try again.`; return; }
      render();
    };
    const reopen = async () => {
      status.textContent = 'Saving…';
      try { await Q.save(g.rows.map((row) => ({ row, decision: '' }))); } catch (err) { status.textContent = `Not saved (${err.message}).`; return; }
      render();
    };

    const changes = g.rows.filter((r) => r.decision === 'change').length;
    const summary = !settled(g) ? 'Ticked values change. Unticked ones are exceptions and stay as they are.'
      : g.rows.some((r) => r.note === 'Not this rule') ? 'Settled: not this rule, nothing changes.'
        : `Settled: ${changes} cell${changes === 1 ? '' : 's'} change, ${g.rows.length - changes} kept as exceptions.`;

    return h('section.q-spell.q-caps', { id: first.check },
      h('header.q-rule__head',
        h('div',
          h('h2.q-rule__question', first.question),
          first.hint && h('p.q-rule__hint', first.hint)),
        h('span.q-rule__count', `${g.rows.length} cell${g.rows.length === 1 ? '' : 's'} · ${photos} photo${photos === 1 ? '' : 's'}`),
      ),
      h('p.q-rule__column', columns.length === 1 ? 'Column ' : 'Columns ',
        h('strong', columns.map((c) => c.replace(/ \(.*$/, '')).join(', '))),
      h('div.q-caps__rows', { role: 'list' }, lines.map((l) => l.el)),
      h('div.q-rule__actions',
        pill('primary', settled(g) ? 'Save again' : 'Apply this rule', true, () => decide(true), { 'data-primary': '' }),
        pill('tag', 'Not this rule', false, () => decide(false)),
        settled(g) && pill('tag', 'Reopen', false, reopen),
        h('span.q-rule__summary', summary),
        status,
      ),
    );
  }

  function capsLine(rs, showColumn) {
    const row = rs[0];
    const decided = rs.find((r) => r.decision);
    const tick = h('input', { type: 'checkbox', checked: decided ? decided.decision === 'change' : true, 'aria-label': `Change “${row.match || row.current}”` });
    const input = h('input.review__input.q-caps__new', { type: 'text', dir: 'auto', value: decided?.decision === 'change' ? decided.final : row.proposed, 'aria-label': 'New value' });
    const ids = [...new Map(rs.map((r) => [r.id, r])).values()];
    const now = row.op === 'replace'
      ? highlight(row.context.snippet || row.current, row.match)
      : marked(row.current, row.proposed);
    const el = h('div.q-caps__row', { role: 'listitem' },
      h('label.q-row__tick', tick),
      h('div.q-caps__what',
        showColumn && h('span.q-label', row.column.replace(/ \(.*$/, '')),
        h('div.q-caps__now', { dir: 'auto' }, now),
        h('div.q-caps__change', h('span.q-caps__arrow', { 'aria-hidden': 'true' }, '→'), input),
      ),
      h('div.q-caps__photos',
        h('span.q-form__count', `${ids.length} photo${ids.length === 1 ? '' : 's'}`),
        h('span.q-form__strip', ids.slice(0, 6).map((r) => Q.thumb(r, 'tiny')),
          ids.length > 6 ? h('span.q-form__more', `+${ids.length - 6}`) : null),
      ),
    );
    const sync = () => el.classList.toggle('is-off', !tick.checked);
    tick.addEventListener('change', sync);
    input.addEventListener('input', () => { tick.checked = true; sync(); });
    sync();
    return { el, row, rows: rs, tick, input };
  }

  // The letters a rule changes, marked: "Circassian <mark>W</mark>arrior".
  function marked(text, next) {
    if (!next || text.length !== next.length) return Q.isolateRtl(text);
    const out = [];
    let plain = '';
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === next[i]) { plain += text[i]; continue; }
      if (plain) { out.push(plain); plain = ''; }
      out.push(h('mark', text[i]));
    }
    if (plain) out.push(plain);
    return out;
  }

  // The form inside the text, marked, so the eye finds it in a long description.
  const highlight = (text, form) => Q.marked(text, form);

  Q.start('spelling', (list_) => { rows = list_; render(); });
})();
