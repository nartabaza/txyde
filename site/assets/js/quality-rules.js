/* ==========================================================================
   Rule checks (/quality-rules/): one section per rule, decided once.

   The researcher can set one value for every row ("Set all to"), untick the exceptions, and save:
   ticked rows change to the value in their box, unticked rows stay as they are.
   ========================================================================== */
(() => {
  const Q = window.Quality;
  if (!Q) return;
  const { $, h, pill } = Q;
  const list = $('.q-list');
  const SHOW = [['todo', 'To settle'], ['done', 'Settled'], ['all', 'All']];
  let rows = [];
  let show = 'todo';
  // Short names for the section bar.
  const NAMES = {
    'diaspora-russia': 'Diaspora in the homeland', 'diaspora-capitals': 'Moscow, St Petersburg',
    'location-empty': 'No location', 'homeland-abroad': 'Homeland abroad', period: 'Period',
    'date-format': 'Date format', 'date-reversed': 'Backwards dates', lifespan: 'Lifespan',
    'anonymous-named': 'Anonymous with names',
  };

  const settled = (g) => g.rows.every((r) => r.decision);

  function render() {
    const gs = Q.groups(rows);
    const done = gs.filter(settled).length;
    Q.progress(done, gs.length, `${done} of ${gs.length} rules settled · ${rows.filter((r) => r.decision === 'change').length} cells to change`);
    $('[data-show]').replaceChildren(...SHOW.map(([v, label]) => pill('tag', label, v === show, () => { show = v; render(); })));
    const shown = gs.filter((g) => show === 'all' || (show === 'done' ? settled(g) : !settled(g)));
    list.replaceChildren(...shown.map(section));
    if (!shown.length) list.append(h('p.review__empty', show === 'todo' ? 'Every rule is settled. Thank you!' : 'Nothing to show here.'));
  }

  function section(g) {
    const { first } = g;
    const lines = g.rows.map(line);
    const status = h('span.review-card__save', { 'aria-live': 'polite' });

    const setAll = first.options.length ? h('div.q-rule__setall',
      h('span.q-label', 'Set all to'),
      ...first.options.map((o) => pill('tag', o, false, () => lines.forEach((l) => l.set(o, true)))),
      pill('tag', 'Keep all as they are', false, () => lines.forEach((l) => l.set(null, false))),
    ) : null;

    const save = async () => {
      const decisions = [];
      for (const l of lines) {
        const d = l.read();
        if (d.decision === 'change' && !d.final) {
          status.textContent = `#${l.row.id} is ticked but has no new value. Type one, or untick it to keep it as it is.`;
          l.input.focus();
          return;
        }
        decisions.push(d);
      }
      status.textContent = 'Saving…';
      try {
        await Q.save(decisions);
      } catch (err) {
        status.textContent = `Not saved (${err.message}). Please try again.`;
        return;
      }
      status.textContent = 'Saved';
      render();
    };
    const reopen = async () => {
      status.textContent = 'Saving…';
      try { await Q.save(g.rows.map((row) => ({ row, decision: '' }))); } catch (err) { status.textContent = `Not saved (${err.message}).`; return; }
      render();
    };

    const changes = g.rows.filter((r) => r.decision === 'change').length;
    return h('section.q-rule', { id: `rule-${first.check}`, 'data-toc': NAMES[first.check] || first.check, 'data-toc-count': g.rows.filter((r) => !r.decision).length || null },
      h('header.q-rule__head',
        h('div',
          h('h2.q-rule__question', first.question),
          first.hint && h('p.q-rule__hint', first.hint)),
        h('span.q-rule__count', `${g.rows.length} photo${g.rows.length === 1 ? '' : 's'}`),
      ),
      h('p.q-rule__column', 'Column ', h('strong', first.column), first.letter ? ` (${first.letter})` : ''),
      setAll,
      h('div.q-rule__rows', { role: 'list' }, lines.map((l) => l.el)),
      h('div.q-rule__actions',
        pill('primary', settled(g) ? 'Save again' : 'Save this rule', true, save, { 'data-primary': '' }),
        settled(g) && pill('tag', 'Reopen', false, reopen),
        h('span.q-rule__summary', settled(g)
          ? `Settled: ${changes} to change, ${g.rows.length - changes} kept as they are.`
          : 'Ticked rows change to the value in their box. Unticked rows stay as they are.'),
        status,
      ),
    );
  }

  function line(row) {
    const listId = `opts-${row.key.replace(/\W+/g, '-')}`;
    const value = row.decision === 'change' ? row.final : row.proposed;
    const tick = h('input', { type: 'checkbox', checked: row.decision ? row.decision === 'change' : Boolean(row.proposed), 'aria-label': `Change #${row.id}` });
    const input = h('input.review__input.q-rule__new', { type: 'text', value: value || '', placeholder: row.options.length ? 'Choose or type' : 'Type the new value', list: row.options.length ? listId : null });
    const datalist = row.options.length ? h('datalist', { id: listId }, row.options.map((o) => h('option', { value: o }))) : null;
    const note = h('input.review__input.q-rule__note', { type: 'text', value: row.note || '', placeholder: 'Note (optional)' });

    const el = h('div.q-row', { role: 'listitem' },
      h('label.q-row__tick', tick),
      Q.thumb(row),
      h('div.q-row__what',
        h('div.q-row__id', `#${row.id}`),
        h('div.q-row__title', row.title || 'Untitled'),
        h('dl.q-row__context', Object.entries(row.context).filter(([, v]) => v).map(([k, v]) =>
          h('div', h('dt', k), h('dd', String(v))))),
      ),
      h('div.q-row__change',
        h('div.q-row__current', h('span.q-label', 'Now'), h('span', row.current ? row.current : h('em.review-card__empty', 'empty'))),
        h('div.q-row__new', h('span.q-label', 'New'), input, datalist),
        note,
      ),
    );
    const sync = () => {
      el.classList.toggle('is-off', !tick.checked);
      el.dataset.decision = row.decision || 'todo';
    };
    tick.addEventListener('change', sync);
    input.addEventListener('input', () => { if (input.value.trim()) tick.checked = true; sync(); });
    sync();
    return {
      el, row, input,
      set(v, on) { if (v != null) input.value = v; tick.checked = on; sync(); },
      read() {
        const final = input.value.trim();
        const change = tick.checked && final !== row.current;
        return { row, decision: change ? 'change' : 'keep', final: change ? final : '', note: note.value.trim() };
      },
    };
  }

  Q.start('rules', (list_) => { rows = list_; render(); });
})();
