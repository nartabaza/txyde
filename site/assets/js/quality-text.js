/* ==========================================================================
   Text on the photos (/quality-text/): one card per photo, the image beside what was read off it.

   For each reading the researcher says whether it is right (correcting it if needed) or not what
   the photo says. A right reading is added to the Photo description, as the sheet's help asks,
   unless it is there already. Below the readings, the photo's inscription fields (Script,
   Sidenote and its language) when the sheet has them empty.

   The photos come in sections (context.section, set by quality_checks.py), most attention first:
   part of the text could not be read; the text disagrees with the sheet ("The photo is right" /
   "The sheet is right"); the sheet says the photo has no text; and clear readings, shown as a
   grid of small cards that are confirmed together. Readings the sheet already has are not here.

   "Can't tell" is for a reading the researcher cannot judge: it settles the reading without
   changing the sheet (decision "keep", note "Can't tell"), and the "Can't tell" filter lists them
   again, to pass on to someone who reads the language or the hand.
   ========================================================================== */
(() => {
  const Q = window.Quality;
  if (!Q) return;
  const { $, h, pill } = Q;
  const list = $('.q-list');
  const SHOW = [['todo', 'To check'], ['done', 'Checked'], ['cant', 'Can\'t tell'], ['all', 'All']];
  const CANT = 'Can\'t tell';
  const isCant = (r) => r.op === 'append' && r.decision === 'keep' && (r.note || '').startsWith(CANT);
  const KIND = { Sidenote: 'Caption or note', Script: 'Text in the picture', Watermark: 'Watermark' };
  const SECTIONS = [
    ['unsure', 'Partly legible'],
    ['conflict', 'Disagrees with the sheet'],
    ['none', 'Marked as having no text'],
    ['clear', 'Clear readings'],
  ];
  let rows = [];
  let show = 'todo';
  const sectionOf = (g) => g.first.context.section || 'unsure';

  const settled = (g) => g.rows.every((r) => r.decision);

  function render() {
    const gs = Q.groups(rows);
    const done = gs.filter(settled).length;
    const wrongs = rows.filter((r) => r.op === 'append' && r.decision === 'reject').length;
    const cants = rows.filter(isCant).length;
    Q.progress(done, gs.length, `${done} of ${gs.length} photos checked · ${wrongs} reading${wrongs === 1 ? '' : 's'} marked wrong · ${cants} can't tell`);
    $('[data-show]').replaceChildren(...SHOW.map(([v, label]) => pill('tag', label, v === show, () => { show = v; render(); })));
    const shown = gs.filter((g) => show === 'all' || (show === 'cant' ? g.rows.some(isCant) : show === 'done' ? settled(g) : !settled(g)));
    list.replaceChildren(...SECTIONS.flatMap(([id, name]) => {
      const part = shown.filter((g) => sectionOf(g) === id);
      if (!part.length) return [];
      const head = h('header.q-section', { id: `section-${id}`, 'data-toc': name, 'data-toc-count': part.length },
        h('h2.q-list__heading', `${name} · ${part.length} photo${part.length === 1 ? '' : 's'}`),
        h('p.q-section__what', part[0].first.question));
      return id === 'clear' ? [head, grid(part)] : [head, ...part.map(card)];
    }));
    if (!shown.length) list.append(h('p.review__empty', show === 'todo' ? 'Every photo is checked. Thank you!' : show === 'cant' ? 'No reading is marked "Can\'t tell".' : 'Nothing to show here.'));
  }

  function card(g) {
    const { first } = g;
    const readings = g.rows.filter((r) => r.op === 'append').map((r) => reading(r, sectionOf(g) === 'conflict' && r.context.sure === 'conflict'));
    const fields = g.rows.filter((r) => r.op !== 'append').map(field);
    const status = h('span.review-card__save', { 'aria-live': 'polite' });

    const save = async () => {
      const open = readings.find((x) => !x.answer());
      if (open) { status.textContent = 'Answer each reading first.'; open.el.scrollIntoView({ block: 'center' }); return; }
      status.textContent = 'Saving…';
      try { await Q.save([...readings, ...fields].map((x) => x.read())); } catch (err) { status.textContent = `Not saved (${err.message}). Please try again.`; return; }
      status.textContent = 'Saved';
      const el = list.querySelector(`#photo-${first.id}`);
      render();
      if (show === 'todo') list.querySelector('.q-text')?.scrollIntoView({ block: 'start' });
      else el && list.querySelector(`#photo-${first.id}`)?.scrollIntoView({ block: 'start' });
    };

    const img = h('img.review-card__image', { src: Q.src(first.imageUrl), alt: first.title || '', loading: 'lazy', decoding: 'async' });
    return h('article.review-card.q-text', { id: `photo-${first.id}`, 'data-status': settled(g) ? 'done' : 'todo' },
      h('a.review-card__media', { href: Q.src(first.imageUrl), target: '_blank', rel: 'noopener', title: 'Open the full image in a new tab' }, img),
      h('div.review-card__details',
        h('div.review-card__top', h('span', `#${first.id}`), h('span.review-card__status', { 'data-status': settled(g) ? 'approved' : 'todo' }, settled(g) ? 'Checked' : 'To check')),
        h('h2.viewer__title.review-card__title', first.title || 'Untitled'),
        h('p.q-rule__hint', first.hint),
        h('div.q-readings', readings.map((x) => x.el)),
        fields.length ? h('div.q-fields', h('div.review-card__label', 'Inscription fields'), fields.map((x) => x.el)) : null,
        h('div.review-card__actions', pill('primary', settled(g) ? 'Save again' : 'Save this photo', true, save, { 'data-primary': '' }), status),
      ),
    );
  }

  function reading(row, conflict) {
    const c = row.context;
    const text = h('textarea.review-card__corrections.q-reading__text', { rows: 2, dir: 'auto', spellcheck: false, value: row.decision === 'change' && row.final ? row.final : row.proposed });
    const add = h('input', { type: 'checkbox', checked: row.decision ? row.decision === 'change' : !c.alreadyInNotes });
    // A reading that disagrees with the sheet: the question is which source wins.
    const WINS = { photo: 'The photo is right: the sheet needs fixing', sheet: 'The sheet is right' };
    let wins = Object.keys(WINS).find((k) => (row.note || '').startsWith(WINS[k])) || '';
    let answer = row.decision === 'reject' ? 'wrong' : isCant(row) ? 'cant' : row.decision ? 'right' : '';
    const right = pill('tag', 'Right', answer === 'right', () => setAnswer('right'));
    const wrong = pill('tag', 'Not what it says', answer === 'wrong', () => setAnswer('wrong'));
    const cant = pill('tag', CANT, answer === 'cant', () => setAnswer('cant'), { title: 'You cannot judge this reading: nothing changes, and it is listed under "Can\'t tell"' });
    const photoWins = pill('tag', 'The photo is right', answer === 'right' && wins === 'photo', () => { wins = 'photo'; setAnswer('right'); });
    const sheetWins = pill('tag', 'The sheet is right', answer === 'right' && wins === 'sheet', () => { wins = 'sheet'; setAnswer('right'); });
    const ownNote = (row.note || '').replace(new RegExp(`^${CANT}:? ?`), '');
    const note = h('input.review__input.q-rule__note', { type: 'text', value: ownNote, placeholder: 'What it really says, or a note (optional)' });
    const el = h('div.q-reading', { 'data-answer': answer || 'todo' },
      h('div.q-reading__kind', KIND[c.kind] || 'Text', c.alreadyInNotes ? h('span.q-reading__tag', 'already in the Photo description') : null),
      h('p.q-reading__note', Q.isolateRtl(c.note || '')),
      h('label.q-label', 'Reading'),
      text,
      h('div.q-reading__answer', ...(conflict ? [photoWins, sheetWins] : [right]), wrong, cant, h('label.q-reading__add', add, ' Add to the Photo description')),
      note,
    );
    function setAnswer(a) {
      answer = a;
      if (a !== 'right') wins = '';
      right.classList.toggle('is-active', a === 'right');
      photoWins.classList.toggle('is-active', a === 'right' && wins === 'photo');
      sheetWins.classList.toggle('is-active', a === 'right' && wins === 'sheet');
      wrong.classList.toggle('is-active', a === 'wrong');
      cant.classList.toggle('is-active', a === 'cant');
      el.dataset.answer = a;
    }
    // Correcting the reading means it is right, as corrected.
    text.addEventListener('input', () => { if (!conflict || wins) setAnswer('right'); });
    return {
      el,
      answer: () => (conflict && answer === 'right' && !wins ? '' : answer),
      read() {
        if (answer === 'wrong') return { row, decision: 'reject', note: note.value.trim() };
        if (answer === 'cant') return { row, decision: 'keep', note: [CANT, note.value.trim()].filter(Boolean).join(': ') };
        const final = text.value.trim();
        const said = [conflict && wins ? WINS[wins] : '', note.value.trim() || (final !== row.proposed ? 'Reading corrected' : '')].filter(Boolean).join('. ');
        return { row, decision: add.checked ? 'change' : 'keep', final: add.checked ? final : '', note: said };
      },
    };
  }

  // ---- Clear readings: a grid of small cards, confirmed together ------------------------

  function grid(groups) {
    const tiles = groups.map(tile);
    const status = h('span.review-card__save', { 'aria-live': 'polite' });
    const open = groups.some((g) => !settled(g));
    const save = async () => {
      status.textContent = 'Saving…';
      try { await Q.save(tiles.flatMap((t) => t.read())); } catch (err) { status.textContent = `Not saved (${err.message}). Please try again.`; return; }
      render();
    };
    return h('section.q-grid',
      h('div.q-grid__tiles', tiles.map((t) => t.el)),
      h('div.q-rule__actions',
        pill('primary', open ? `Save these ${groups.length}` : 'Save again', true, save, { 'data-primary': '' }),
        h('span.q-rule__summary', 'Every reading starts as Right and goes into the Photo description. Mark the ones that are not what the photo says, or that you cannot judge; correct a reading in its box.'),
        status),
    );
  }

  function tile(g) {
    const { first } = g;
    const reads = g.rows.filter((r) => r.op === 'append').map((row) => {
      let answer = row.decision === 'reject' ? 'wrong' : isCant(row) ? 'cant' : 'right';
      const text = h('textarea.review-card__corrections.q-reading__text', { rows: 2, dir: 'auto', spellcheck: false, value: row.decision === 'change' && row.final ? row.final : row.proposed, 'aria-label': 'Reading' });
      const buttons = { right: pill('tag', 'Right', false, () => set('right')), wrong: pill('tag', 'Wrong', false, () => set('wrong')), cant: pill('tag', CANT, false, () => set('cant')) };
      const el = h('div.q-tile__reading',
        h('div.q-reading__kind', KIND[row.context.kind] || 'Text'),
        text,
        h('div.q-tile__answer', Object.values(buttons)));
      function set(a) {
        answer = a;
        Object.entries(buttons).forEach(([k, b]) => b.classList.toggle('is-active', k === a));
        el.dataset.answer = a;
      }
      text.addEventListener('input', () => set('right'));
      set(answer);
      return {
        el,
        read() {
          if (answer === 'wrong') return { row, decision: 'reject', note: 'Not what the photo says' };
          if (answer === 'cant') return { row, decision: 'keep', note: CANT };
          const final = text.value.trim();
          return { row, decision: 'change', final, note: final !== row.proposed ? 'Reading corrected' : '' };
        },
      };
    });
    const fields = g.rows.filter((r) => r.op !== 'append').map((row) => {
      const tick = h('input', { type: 'checkbox', checked: row.decision ? row.decision === 'change' : true });
      return {
        el: h('label.q-tile__field', tick, ` ${row.column}: `, h('strong', row.decision === 'change' ? row.final : row.proposed)),
        read: () => (tick.checked ? { row, decision: 'change', final: row.proposed } : { row, decision: 'keep' }),
      };
    });
    return {
      el: h('article.q-tile', { id: `photo-${first.id}`, 'data-status': settled(g) ? 'done' : 'todo' },
        Q.thumb(first, 'tile'),
        h('div.q-tile__body',
          h('div.q-where__id', `#${first.id}`, settled(g) ? ' · checked' : ''),
          h('div.q-row__title', first.title || 'Untitled'),
          reads.map((x) => x.el),
          fields.map((x) => x.el))),
      read: () => [...reads, ...fields].map((x) => x.read()),
    };
  }

  function field(row) {
    const id = `opts-${row.key.replace(/\W+/g, '-')}`;
    const value = row.decision === 'change' ? row.final : row.proposed;
    const tick = h('input', { type: 'checkbox', checked: row.decision ? row.decision === 'change' : true });
    const input = h('input.review__input.q-rule__new', { type: 'text', value, list: id });
    input.addEventListener('input', () => { tick.checked = true; });
    return {
      el: h('div.q-field',
        h('label.q-row__tick', tick),
        h('div',
          h('div.q-field__name', row.column),
          h('div.q-row__current', h('span.q-label', 'Now'), h('span', row.current || h('em.review-card__empty', 'empty')))),
        h('div.q-row__new', h('span.q-label', 'New'), input, h('datalist', { id }, row.options.map((o) => h('option', { value: o })))),
      ),
      read() {
        const final = input.value.trim();
        const change = tick.checked && final && final !== row.current;
        return { row, decision: change ? 'change' : 'keep', final: change ? final : '' };
      },
    };
  }

  Q.start('text', (list_) => { rows = list_; render(); });
})();
