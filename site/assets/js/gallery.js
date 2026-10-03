// Photo gallery: place + tag filters and the photo viewer.
// The markup (cards, filter buttons, viewer) is rendered by build.js
// from src/categories/<slug>.json; this script only adds behaviour.
(function () {
  const gallery = document.querySelector('.gallery');
  const viewer = document.querySelector('.viewer');
  if (!gallery || !viewer) return;

  const cards = Array.from(gallery.querySelectorAll('.photo-card'));
  const placeButtons = Array.from(gallery.querySelectorAll('[data-filter-place]'));
  const tagButtons = Array.from(gallery.querySelectorAll('[data-filter-tag]'));

  const view = {
    image: viewer.querySelector('.viewer__image'),
    title: viewer.querySelector('.viewer__title'),
    description: viewer.querySelector('.viewer__description'),
    counter: viewer.querySelector('.viewer__counter'),
    shell: viewer.querySelector('.viewer__shell'),
    prev: viewer.querySelector('.viewer__nav--prev'),
    next: viewer.querySelector('.viewer__nav--next'),
    tagsRow: viewer.querySelector('[data-row="tags"]'),
    fields: {
      year: viewer.querySelector('[data-field="year"]'),
      country: viewer.querySelector('[data-field="country"]'),
      city: viewer.querySelector('[data-field="city"]'),
      tags: viewer.querySelector('[data-field="tags"]'),
    },
  };

  const filters = { place: 'all', tag: 'all' };
  let visible = [];
  let current = 0;

  // ---- Filters -----------------------------------------------------------

  function applyFilters() {
    cards.forEach((card) => {
      const tags = (card.dataset.tags || '').split(',').filter(Boolean);
      const placeMatch = filters.place === 'all' || card.dataset.country === filters.place;
      const tagMatch = filters.tag === 'all' || tags.includes(filters.tag);
      card.hidden = !(placeMatch && tagMatch);
    });
  }

  function bindFilter(buttons, key, attribute) {
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        filters[key] = button.getAttribute(attribute);
        buttons.forEach((b) => b.classList.toggle('is-active', b === button));
        applyFilters();
      });
    });
  }

  bindFilter(placeButtons, 'place', 'data-filter-place');
  bindFilter(tagButtons, 'tag', 'data-filter-tag');

  // ---- Viewer ------------------------------------------------------------

  function show() {
    const card = visible[current];
    if (!card) return;
    const data = card.dataset;
    const img = card.querySelector('img');

    view.image.src = data.full || img.src;
    view.image.alt = img.alt || data.title || '';
    view.title.textContent = data.title || 'Untitled photo';
    view.fields.year.textContent = data.year || 'Unknown';
    view.fields.country.textContent = data.country || 'Unknown';
    view.fields.city.textContent = data.city || 'Unknown';
    view.fields.tags.textContent = data.tagsDisplay || 'None';
    view.tagsRow.hidden = !data.tagsDisplay;
    view.description.textContent = data.description || '';
    view.counter.textContent = `${current + 1} / ${visible.length}`;
    view.shell.scrollTop = 0;
    view.prev.disabled = visible.length <= 1;
    view.next.disabled = visible.length <= 1;
  }

  function open(card) {
    visible = cards.filter((c) => !c.hidden);
    current = Math.max(visible.indexOf(card), 0);
    viewer.classList.add('is-open');
    viewer.classList.remove('details-hidden');
    viewer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('viewer-open');
    show();
  }

  function close() {
    viewer.classList.remove('is-open', 'details-hidden');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.body.classList.remove('viewer-open');
  }

  function step(delta) {
    if (!visible.length) return;
    current = (current + delta + visible.length) % visible.length;
    show();
  }

  cards.forEach((card) => {
    card.querySelector('.photo-card__trigger').addEventListener('click', () => open(card));
  });

  viewer.querySelector('.viewer__close').addEventListener('click', close);
  view.prev.addEventListener('click', () => step(-1));
  view.next.addEventListener('click', () => step(1));
  viewer.querySelector('.viewer__hide-details').addEventListener('click', () => {
    viewer.classList.add('details-hidden');
  });
  viewer.querySelector('.viewer__show-details').addEventListener('click', () => {
    viewer.classList.remove('details-hidden');
  });
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!viewer.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
})();
