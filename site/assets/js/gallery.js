// Photo gallery: place + tag filters and the photo viewer.
// The markup (cards, filter buttons, viewer) is rendered by build.js
// from src/categories/<slug>.json; this script only adds behaviour.
(function () {
  const gallery = document.querySelector('.gallery');
  const viewer = document.querySelector('.viewer');
  if (!gallery || !viewer) return;

  const page = document.querySelector('.page');
  const cards = Array.from(gallery.querySelectorAll('.photo-card'));
  const cardTags = new Map(cards.map((card) => [card, (card.dataset.tags || '').split(',').filter(Boolean)]));
  const placeButtons = Array.from(gallery.querySelectorAll('[data-filter-place]'));
  const tagButtons = Array.from(gallery.querySelectorAll('[data-filter-tag]'));
  const tagGroup = gallery.querySelector('[data-tag-group]');
  const empty = gallery.querySelector('.gallery__empty');

  const view = {
    image: viewer.querySelector('.viewer__image'),
    title: viewer.querySelector('.viewer__title'),
    description: viewer.querySelector('.viewer__description'),
    counter: viewer.querySelector('.viewer__counter'),
    shell: viewer.querySelector('.viewer__shell'),
    media: viewer.querySelector('.viewer__media'),
    close: viewer.querySelector('.viewer__close'),
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

  const inPlace = (card) => filters.place === 'all' || card.dataset.country === filters.place;

  function applyFilters() {
    let shown = 0;
    cards.forEach((card) => {
      const match = inPlace(card) && (filters.tag === 'all' || cardTags.get(card).includes(filters.tag));
      card.hidden = !match;
      if (match) shown += 1;
    });

    // Only offer tags that have photos in the selected place.
    // The active tag always stays visible so the current filter is never hidden.
    const available = new Set();
    cards.forEach((card) => {
      if (inPlace(card)) cardTags.get(card).forEach((tag) => available.add(tag));
    });
    let tagsShown = 0;
    tagButtons.forEach((button) => {
      const tag = button.dataset.filterTag;
      const keep = tag === 'all' || tag === filters.tag || available.has(tag);
      button.hidden = !keep;
      if (keep && tag !== 'all') tagsShown += 1;
    });
    if (tagGroup) tagGroup.hidden = tagsShown === 0;

    if (empty) empty.hidden = shown > 0;
  }

  function setFilter(key, value) {
    filters[key] = value;
    const buttons = key === 'place' ? placeButtons : tagButtons;
    const attribute = key === 'place' ? 'filterPlace' : 'filterTag';
    buttons.forEach((b) => b.classList.toggle('is-active', b.dataset[attribute] === value));
  }

  placeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setFilter('place', button.dataset.filterPlace);
      applyFilters();
    });
  });
  tagButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setFilter('tag', button.dataset.filterTag);
      applyFilters();
    });
  });

  function resetFilters() {
    setFilter('place', 'all');
    setFilter('tag', 'all');
    applyFilters();
  }

  if (empty) empty.querySelector('.gallery__empty-reset').addEventListener('click', resetFilters);

  // ---- Viewer ------------------------------------------------------------

  const isOpen = () => viewer.classList.contains('is-open');
  const photoHash = (card) => (card.dataset.id ? `#photo-${card.dataset.id}` : '');
  const cardFromHash = () => {
    const match = location.hash.match(/^#photo-(.+)$/);
    return match ? cards.find((card) => card.dataset.id === decodeURIComponent(match[1])) : null;
  };

  // Text and image change together, so a caption never sits under the previous photo.
  function render(card) {
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

  let loading = 0;
  function show({ wait }) {
    const card = visible[current];
    if (!card) return;
    const token = ++loading;
    if (!wait) {
      viewer.classList.remove('is-loading');
      render(card);
      return;
    }
    // Keep the current photo (dimmed) until the next one has downloaded.
    viewer.classList.add('is-loading');
    const next = new Image();
    next.onload = next.onerror = () => {
      if (token !== loading) return; // the visitor already moved on
      render(card);
      viewer.classList.remove('is-loading');
    };
    next.src = card.dataset.full || card.querySelector('img').src;
  }

  // Back button: opening a photo adds a history entry, so Back closes the viewer
  // instead of leaving the page. Moving between photos replaces that entry.
  const ownsHistoryEntry = () => Boolean(history.state && history.state.txydeViewer);
  let opener = null;

  function open(card, { fromHistory = false } = {}) {
    if (card.hidden) resetFilters();
    visible = cards.filter((c) => !c.hidden);
    current = Math.max(visible.indexOf(card), 0);

    if (!fromHistory) history.pushState({ txydeViewer: true }, '', photoHash(card) || location.href);
    if (isOpen()) return show({ wait: true });

    opener = document.activeElement;
    view.image.src = 'data:,'; // don't flash the last photo viewed
    viewer.classList.add('is-open');
    viewer.classList.remove('details-hidden');
    viewer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('viewer-open');
    if (page) page.inert = true;
    show({ wait: false });
    view.close.focus({ preventScroll: true });
  }

  function hide() {
    loading += 1;
    viewer.classList.remove('is-open', 'details-hidden', 'is-loading');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.body.classList.remove('viewer-open');
    if (page) page.inert = false;
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
  }

  function close() {
    if (!isOpen()) return;
    if (ownsHistoryEntry()) {
      history.back(); // popstate below hides the viewer
    } else {
      // Opened from a shared link: drop the photo from the address and stay on the page.
      history.replaceState(null, '', location.pathname + location.search);
      hide();
    }
  }

  function step(delta) {
    if (!visible.length) return;
    current = (current + delta + visible.length) % visible.length;
    const hash = photoHash(visible[current]);
    if (hash) history.replaceState(history.state, '', hash);
    show({ wait: true });
  }

  window.addEventListener('popstate', () => {
    const card = cardFromHash();
    if (card) open(card, { fromHistory: true });
    else if (isOpen()) hide();
  });

  cards.forEach((card) => {
    card.querySelector('.photo-card__trigger').addEventListener('click', () => open(card));
  });

  view.close.addEventListener('click', close);
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
    if (!isOpen()) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });

  // Swipe left/right on the photo to move between photos (touch screens).
  let touchStart = null;
  view.media.addEventListener('touchstart', (event) => {
    touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  view.media.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ---- Start -------------------------------------------------------------

  applyFilters();
  const linked = cardFromHash();
  if (linked) open(linked, { fromHistory: true });
})();
