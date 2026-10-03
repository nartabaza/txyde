// Shared behaviour for every page: sticky header, mobile drawer, back-to-top.
(function () {
  const bar = document.querySelector('.site-header__bar');
  const drawer = document.querySelector('.drawer');
  const overlay = document.querySelector('.drawer-overlay');
  const toggle = document.querySelector('.menu-toggle');
  const closeButton = document.querySelector('.drawer__close');
  const backToTop = document.querySelector('.back-to-top');

  // Sticky header: pin the bar once the page scrolls past its height.
  // The pinned style only applies on desktop (see layout.css).
  if (bar) {
    const threshold = bar.clientHeight;
    const update = () => bar.classList.toggle('is-sticky', window.scrollY > threshold);
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // Mobile drawer
  function setDrawer(open) {
    if (!drawer) return;
    drawer.classList.toggle('is-open', open);
    overlay.classList.toggle('is-open', open);
    document.body.classList.toggle('drawer-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  if (toggle) toggle.addEventListener('click', () => setDrawer(true));
  if (closeButton) closeButton.addEventListener('click', () => setDrawer(false));
  if (overlay) overlay.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setDrawer(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1240) setDrawer(false);
  });

  if (backToTop) {
    backToTop.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
