// Coming-soon page: slideshow, then a password form on click.
// The password is checked against the SHA-256 hash in /gate.json (made by scripts/set_password.js),
// so it can be changed by replacing that file. A correct password is remembered on this device;
// every page checks for it in its <head>.
// This keeps casual visitors and search engines out. It is not real security.
(function () {
  const KEY = 'txyde-pass';
  const SALT = 'txyde-gate:'; // must match scripts/set_password.js
  const { file, home } = window.GATE;
  const params = new URLSearchParams(location.search);
  // Only follow "next" back into this site.
  const next = (params.get('next') || '').startsWith('/') && !params.get('next').startsWith('//') ? params.get('next') : home;

  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const hashReady = fetch(file, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((g) => g?.hash || null)
    .catch(() => null);
  hashReady.then((hash) => { if (hash && stored() === hash) location.replace(next); });

  // ---- Slideshow ----------------------------------------------------------
  const slides = [...document.querySelectorAll('.gate__slide')];
  const caption = document.querySelector('.gate__caption');
  let current = 0;

  function show(i) {
    slides[current].classList.remove('is-active');
    current = i;
    slides[current].classList.add('is-active');
    caption.classList.add('is-changing');
    setTimeout(() => {
      caption.textContent = slides[current].dataset.caption;
      caption.classList.remove('is-changing');
    }, 800);
    // Load the one after next in the background so it is ready in time.
    const ahead = slides[(current + 1) % slides.length];
    if (ahead.dataset.src) { ahead.src = ahead.dataset.src; delete ahead.dataset.src; }
  }

  if (slides.length) {
    const first = slides[0];
    const start = () => { requestAnimationFrame(() => show(0)); };
    first.complete ? start() : first.addEventListener('load', start, { once: true });
    if (slides.length > 1) setInterval(() => show((current + 1) % slides.length), 7000);
  }

  // ---- Password -----------------------------------------------------------
  const panel = document.querySelector('.gate__panel');
  const form = document.querySelector('.gate__form');
  const input = document.querySelector('.gate__input');
  const error = document.querySelector('.gate__error');

  function openPanel() {
    if (!panel.hidden) return;
    panel.hidden = false;
    document.body.classList.add('is-signing-in');
    input.focus();
  }
  function closePanel() {
    panel.hidden = true;
    document.body.classList.remove('is-signing-in');
    error.textContent = '';
  }

  document.addEventListener('click', (e) => {
    if (panel.hidden) openPanel();
    else if (!form.contains(e.target)) closePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
    else if (panel.hidden && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPanel(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = await hashReady;
    if (!hash) {
      error.textContent = 'Sign-in is not available right now.';
      return;
    }
    if ((await sha256(SALT + input.value)) === hash) {
      try { localStorage.setItem(KEY, hash); } catch {}
      location.replace(next);
      return;
    }
    error.textContent = 'That password is not right.';
    form.classList.remove('is-wrong');
    void form.offsetWidth; // restart the shake
    form.classList.add('is-wrong');
    input.select();
  });

  // crypto.subtle only exists on https (and localhost); fall back to plain JS elsewhere.
  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Fallback(bytes);
  }

  function sha256Fallback(bytes) {
    const K = [];
    const H = [];
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) >>> 0;
    for (let n = 2, found = 0; found < 64; n++) {
      let prime = true;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
      if (!prime) continue;
      if (found < 8) H[found] = frac(Math.sqrt(n));
      K[found++] = frac(Math.cbrt(n));
    }
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const data = new Uint8Array(total);
    data.set(bytes);
    data[len] = 0x80;
    const view = new DataView(data.buffer);
    view.setUint32(total - 8, Math.floor(len / 0x20000000));
    view.setUint32(total - 4, (len * 8) >>> 0);
    const w = new Uint32Array(64);
    const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
    }
    return H.map((v) => v.toString(16).padStart(8, '0')).join('');
  }
})();
