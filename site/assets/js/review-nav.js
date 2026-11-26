/* ==========================================================================
   Moving between the review pages (/review/ and the data check pages).

   The bar at the top (partial review-nav) links every review page; this marks the current one.
   A page whose list has two or more sections ([data-toc] elements, with a short name and an
   optional count) also gets a sticky section bar above the list, that follows the scroll.
   The pager at the bottom (partial review-foot) links the previous and next page in the bar's
   order, and the round button brings a long page back to the top. ?demo is kept on the links.
   ========================================================================== */
(() => {
  const nav = document.querySelector('.review-nav');
  if (!nav) return;
  const links = [...nav.querySelectorAll('a')];
  const here = (a) => a.pathname.replace(/\/+$/, '') === location.pathname.replace(/\/+$/, '');
  const current = links.findIndex(here);
  if (current >= 0) links[current].setAttribute('aria-current', 'page');

  if (new URLSearchParams(location.search).has('demo')) {
    links.forEach((a) => { a.search = 'demo'; });
  }

  // Previous and next, in the order of the bar.
  const pager = document.querySelector('[data-review-pager]');
  if (pager && current >= 0) {
    const step = (a, rel, label) => {
      const link = document.createElement('a');
      link.className = `review-pager__link review-pager__link--${rel}`;
      link.href = a.href;
      link.rel = rel;
      const small = document.createElement('span');
      small.className = 'review-pager__label';
      small.textContent = label;
      link.append(small, a.textContent);
      return link;
    };
    const prev = links[current - 1];
    const next = links[current + 1];
    pager.append(...[prev && step(prev, 'prev', '← Previous'), next && step(next, 'next', 'Next →')].filter(Boolean));
  }

  // ---- Section bar ------------------------------------------------------------------------
  const list = document.querySelector('.q-list');
  if (list) {
    const bar = document.createElement('nav');
    bar.className = 'review-toc';
    bar.setAttribute('aria-label', 'Sections of this page');
    bar.hidden = true;
    list.before(bar);
    let sections = [];
    // The site header pins itself (61px) once the page scrolls, on screens 1240px and wider
    // (layout.css); the bar sits under it. Counted even before it pins, as a jump scrolls past it.
    const wide = window.matchMedia('(min-width: 1240px)');
    const headerHeight = () => (wide.matches ? 61 : 0);
    const build = () => {
      sections = [...list.querySelectorAll('[data-toc]')];
      bar.hidden = sections.length < 2;
      bar.replaceChildren(...sections.map((el) => {
        const a = document.createElement('a');
        a.className = 'review-toc__link';
        a.href = `#${el.id}`;
        a.textContent = el.dataset.toc;
        if (el.dataset.tocCount) {
          const n = document.createElement('span');
          n.className = 'review-toc__count';
          n.textContent = el.dataset.tocCount;
          a.append(n);
        }
        a.addEventListener('click', (event) => {
          event.preventDefault();
          const top = el.getBoundingClientRect().top + window.scrollY - headerHeight() - bar.offsetHeight - 12;
          window.scrollTo({ top, behavior: 'smooth' });
        });
        return a;
      }));
      mark();
    };
    // The section under the bar is the current one.
    const mark = () => {
      if (bar.hidden) return;
      bar.style.top = `${headerHeight()}px`;
      const line = headerHeight() + bar.offsetHeight + 24;
      let current = 0;
      sections.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) current = i; });
      [...bar.children].forEach((a, i) => {
        if (i === current) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
      // Keep the current link in view when the bar is wider than the screen (sideways only).
      const link = bar.children[current];
      if (link && (link.offsetLeft < bar.scrollLeft || link.offsetLeft + link.offsetWidth > bar.scrollLeft + bar.clientWidth)) {
        bar.scrollLeft = link.offsetLeft - 16;
      }
    };
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; build(); });
    }).observe(list, { childList: true });
    window.addEventListener('scroll', mark, { passive: true });
    window.addEventListener('resize', mark);
    build();
  }

  // Back to the top, once the page has scrolled a screen down.
  const top = document.querySelector('.review-top');
  if (top) {
    const update = () => { top.hidden = window.scrollY < window.innerHeight; };
    window.addEventListener('scroll', update, { passive: true });
    update();
    top.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.querySelector('h1')?.focus({ preventScroll: true });
    });
  }
})();
