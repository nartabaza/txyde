#!/usr/bin/env node
// TXYDE static site builder. No dependencies, just Node 18+.
//
//   node build.js           build the site into dist/
//   node build.js --serve   build, serve on http://localhost:8080 and rebuild on changes
//
// Environment (used for the GitHub Pages preview):
//   BASE_PATH=/txyde        prefix every site link, for hosting under a sub-path
//   PREVIEW=1               no analytics, and ask search engines not to index
//
// Sources:
//   src/site.json           site name, URL, navigation, analytics id, password gate
//   src/gate.html           the coming-soon page with the password form -> /welcome/
//   src/layouts/base.html   the HTML shell every page uses
//   src/partials/*.html     header, footer, drawer, viewer
//   src/pages/*.html        one file per page (front matter + HTML)
//   src/categories/*.json   one file per photo category -> /<slug>/
//   src/templates/*.html    page templates filled from data
//   assets/                 copied as-is to dist/assets/

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const PREVIEW = Boolean(process.env.PREVIEW);

// Icons extracted from the original theme's icon font (1000-unit em, baseline at 850).
const glyph = (d, x = 0) =>
  `<svg class="icon" viewBox="0 0 1000 1000" aria-hidden="true"><path transform="matrix(1 0 0 -1 ${x} 850)" d="${d}"/></svg>`;
const ICONS = {
  menu: glyph('M31 631h938c17 0 31 14 31 32 0 17-14 31-31 31h-938c-17 0-31-14-31-31 0-18 14-32 31-32z m938-250h-938c-17 0-31-14-31-31 0-17 14-31 31-31h938c17 0 31 14 31 31 0 17-14 31-31 31z m0-312h-938c-17 0-31-14-31-31 0-18 14-32 31-32h938c17 0 31 14 31 32 0 17-14 31-31 31z'),
  close: glyph('M535 350l295 295c10 10 10 25 0 35s-25 10-35 0l-295-295-295 295c-10 10-25 10-35 0s-10-25 0-35l295-295-295-295c-10-10-10-25 0-35 5-5 11-7 18-7s12 2 17 7l295 295 295-295c5-5 11-7 18-7s12 2 17 7c10 10 10 25 0 35l-295 295z'),
  up: glyph('M804 130l-372 358-370-358q-26-22-50 0-24 24 0 50l396 390q26 26 48 0l396-390q24-26 0-50-26-22-48 0z', 68),
};

// ---- Helpers ---------------------------------------------------------------

const read = (file) => fs.readFileSync(file, 'utf8');
const readJSON = (file) => JSON.parse(read(file));

const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const slugify = (text) =>
  text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

const lookup = (ctx, key) => key.split('.').reduce((obj, part) => obj?.[part], ctx);

// Tiny template language: {{> partial }}, {{{ raw }}}, {{ escaped }}.
function render(template, ctx, partials) {
  return template
    .replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => render(partials[name] ?? '', ctx, partials))
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => lookup(ctx, key) ?? '')
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => escape(lookup(ctx, key)));
}

// "---\nkey: value\n---\nbody" -> { data, body }
function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { data, body: text.slice(match[0].length) };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(src, dest) : fs.copyFileSync(src, dest);
  }
}

// Root-relative links ("/assets/...", "/homeland/") get the base path in front.
const withBase = (html) => (BASE ? html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${BASE}/`) : html);

function writePage(url, html) {
  html = withBase(html);
  const file = path.join(OUT, url, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---- Shared page pieces ----------------------------------------------------

function renderNav(site, url, itemClass, linkClass) {
  return site.nav
    .map(({ label, href }) => {
      const current = href === url ? ' aria-current="page"' : '';
      const text = linkClass === 'site-nav__link' ? `<span>${escape(label)}</span>` : escape(label);
      return `<li class="${itemClass}"><a class="${linkClass}" href="${escape(href)}"${current}>${text}</a></li>`;
    })
    .join('\n');
}

function renderAnalytics(id) {
  if (!id) return '';
  return `  <script async src="https://www.googletagmanager.com/gtag/js?id=${escape(id)}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${escape(id)}');
  </script>`;
}

const stylesheetLinks = (names) =>
  names.map((n) => `  <link rel="stylesheet" href="/assets/css/${n}.css">`).join('\n');

// Password gate (site.json "gate"). Each page checks, before anything shows, that this device
// has entered the password, and otherwise goes to /welcome/. It keeps casual visitors and
// search engines out; it is not real security (see README).
//
// The password's hash is not built into the pages. It lives in /gate.json next to them, so the
// password can be changed by replacing that one file. Visitors signed in with an old password
// are sent back to /welcome/. The build writes gate.json from GATE_PASSWORD_HASH (environment or .env).
const GATE_PATH = '/welcome/';
const GATE_FILE = '/gate.json';
const gateOn = (site) => Boolean(site.gate?.enabled);

// GATE_PASSWORD_HASH from the environment, else from .env in site/ or the repo root.
function readGateHash() {
  if (process.env.GATE_PASSWORD_HASH) return process.env.GATE_PASSWORD_HASH.trim();
  for (const file of [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')]) {
    if (!fs.existsSync(file)) continue;
    const match = read(file).match(/^\s*GATE_PASSWORD_HASH\s*=\s*"?([0-9a-f]{64})"?\s*$/m);
    if (match) return match[1];
  }
  return '';
}

function renderGateCheck(site) {
  if (!gateOn(site)) return '';
  const gate = JSON.stringify(BASE + GATE_PATH);
  const file = JSON.stringify(BASE + GATE_FILE);
  return `<script>(function(){var t=null;try{t=localStorage.getItem('txyde-pass')}catch(e){}function out(){try{localStorage.removeItem('txyde-pass')}catch(e){}location.replace(${gate}+'?next='+encodeURIComponent(location.pathname+location.search+location.hash))}if(!t){document.documentElement.style.display='none';out();return}fetch(${file},{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(g){if(g&&g.hash&&g.hash!==t)out()}).catch(function(){})})();</script>`;
}

function renderGatePage(site, partials) {
  const slides = (site.gate.slides || [])
    .map((s, i) => {
      // "focus" is where the main subject sits; it stays in view when the photo is cropped to the screen.
      const focus = /^\d+% \d+%$/.test(s.focus || '') ? s.focus : '50% 50%';
      return `    <img class="gate__slide" ${i === 0 ? 'src' : 'data-src'}="${escape(s.image)}" style="object-position: ${focus}; transform-origin: ${focus}" data-caption="${escape(s.caption || '')}" alt="" decoding="async">`;
    })
    .join('\n');
  return render(read(path.join(SRC, 'gate.html')), {
    site,
    slides,
    file: BASE + GATE_FILE,
    home: BASE + '/',
    analytics: PREVIEW ? '' : renderAnalytics(site.analyticsId),
  }, partials);
}

function renderDocument({ site, partials, layout }, page) {
  const ctx = {
    site,
    icons: ICONS,
    year: new Date().getFullYear(),
    title: page.title,
    description: page.description || site.description,
    canonical: site.url + page.url,
    ogType: page.ogType || 'article',
    styles: stylesheetLinks(page.styles || []),
    scripts: (page.scripts || []).map((s) => `  <script src="/assets/js/${s}.js" defer></script>`).join('\n'),
    analytics: PREVIEW ? '' : renderAnalytics(site.analyticsId),
    robots: PREVIEW || gateOn(site) ? '<meta name="robots" content="noindex, nofollow">' : '',
    gateCheck: renderGateCheck(site),
    navDesktop: renderNav(site, page.url, 'site-nav__item', 'site-nav__link'),
    navDrawer: renderNav(site, page.url, 'drawer__item', 'drawer__link'),
    content: page.content,
    afterPage: page.afterPage || '',
  };
  return render(layout, ctx, partials);
}

// ---- Category (gallery) pages ---------------------------------------------

// Smaller copies made by scripts/make_images.py: original URL -> { thumb, large, width, height }.
// Only copies confirmed on the CDN are listed; other photos use the original.
function readImageCopies() {
  const file = path.join(SRC, 'images.json');
  return fs.existsSync(file) ? readJSON(file) : {};
}

function renderCategory(category, template, partials, copies) {
  const photos = category.photos.map((photo) => ({
    ...photo,
    tagList: (photo.tags || []).map((label) => ({ label, slug: slugify(label) })),
  }));

  const button = (kind, attr, value, label, active) =>
    `            <button class="filter-button filter-button--${kind}${active ? ' is-active' : ''}" type="button" ${attr}="${escape(value)}">${escape(label)}</button>`;

  const places = [...new Set(photos.map((p) => p.country).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const placeButtons = [
    button('primary', 'data-filter-place', 'all', 'Show All', true),
    ...places.map((place) => button('primary', 'data-filter-place', place, place)),
  ].join('\n');

  const tags = new Map();
  photos.forEach((p) => p.tagList.forEach((t) => tags.has(t.slug) || tags.set(t.slug, t.label)));
  const tagGroup = tags.size
    ? `        <div class="filter-group" data-tag-group>
          <div class="filter-group__label">Tags</div>
          <div class="filter-group__buttons">
${[
  button('tag', 'data-filter-tag', 'all', 'All Tags', true),
  ...[...tags].sort((a, b) => a[1].localeCompare(b[1])).map(([slug, label]) => button('tag', 'data-filter-tag', slug, label)),
].join('\n')}
          </div>
        </div>`
    : '';

  const cards = photos
    .map((p) => {
      const copy = copies[p.image];
      const data = {
        id: p.id ?? '',
        country: p.country,
        tags: p.tagList.map((t) => t.slug).join(','),
        full: copy?.large || p.image,
        title: p.title,
        year: p.year,
        region: p.region,
        // Older imports only kept one merged place name ("city"); show it as the locality until re-imported.
        locality: p.locality ?? p.city,
        sublocality: p.sublocality,
        'tags-display': p.tagList.map((t) => t.label).join(', '),
        description: p.description,
      };
      const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${escape(v)}"`).join(' ');
      const size = copy ? ` width="${copy.width}" height="${copy.height}"` : '';
      return `        <article class="photo-card" ${attrs}>
          <button class="photo-card__trigger" type="button" aria-label="View ${escape(p.title)}">
            <img class="photo-card__image" src="${escape(copy?.thumb || p.thumb || p.image)}" alt="${escape(p.title)}"${size} loading="lazy" decoding="async">
          </button>
          <h2 class="photo-card__title">${escape(p.title)}</h2>
        </article>`;
    })
    .join('\n');

  return render(template, { ...category, placeButtons, tagGroup, cards }, partials);
}

// ---- Build -----------------------------------------------------------------

function build() {
  const started = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));

  const site = readJSON(path.join(SRC, 'site.json'));
  const layout = read(path.join(SRC, 'layouts', 'base.html'));
  const partials = {};
  for (const file of fs.readdirSync(path.join(SRC, 'partials'))) {
    partials[path.basename(file, '.html')] = read(path.join(SRC, 'partials', file));
  }
  const env = { site, partials, layout };
  const built = [];

  // Plain pages
  for (const file of fs.readdirSync(path.join(SRC, 'pages'))) {
    const name = path.basename(file, '.html');
    const url = name === 'index' ? '/' : `/${name}/`;
    const { data, body } = parseFrontMatter(read(path.join(SRC, 'pages', file)));
    const styles = data.styles ? data.styles.split(',').map((s) => s.trim()) : [];
    writePage(url, renderDocument(env, { ...data, url, styles, content: body }));
    built.push(url);
  }

  // Category gallery pages
  const template = read(path.join(SRC, 'templates', 'category.html'));
  const copies = readImageCopies();
  for (const file of fs.readdirSync(path.join(SRC, 'categories')).filter((f) => f.endsWith('.json'))) {
    const category = readJSON(path.join(SRC, 'categories', file));
    const url = `/${category.slug}/`;
    writePage(url, renderDocument(env, {
      url,
      title: category.metaTitle || `${category.title} - ${site.name}`,
      description: category.description,
      styles: ['gallery'],
      scripts: ['gallery'],
      content: renderCategory(category, template, partials, copies),
      afterPage: partials.viewer,
    }));
    built.push(url);
  }

  // Coming-soon page with the password form
  if (gateOn(site)) {
    writePage(GATE_PATH, renderGatePage(site, partials));
    built.push(GATE_PATH);
    const hash = readGateHash();
    if (/^[0-9a-f]{64}$/.test(hash)) {
      fs.writeFileSync(path.join(OUT, GATE_FILE), JSON.stringify({ hash }) + '\n');
    } else {
      console.warn('No GATE_PASSWORD_HASH set, so dist/gate.json was not written and nobody can sign in.\n' +
        'Run: node scripts/set_password.js "your password"   (or upload a gate.json you already have)');
    }
  }

  console.log(`Built ${built.length} pages in ${Date.now() - started}ms: ${built.join(' ')}`);
}

// ---- Dev server ------------------------------------------------------------

function serve(port) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  };
  http.createServer((req, res) => {
    let file = path.join(OUT, decodeURIComponent(req.url.split('?')[0]));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(OUT) || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`Serving dist/ on http://localhost:${port}`));

  let timer;
  for (const dir of ['src', 'assets']) {
    fs.watch(path.join(ROOT, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { build(); } catch (err) { console.error(err.message); }
      }, 100);
    });
  }
}

build();
if (process.argv.includes('--serve')) {
  const i = process.argv.indexOf('--port');
  serve(i > -1 ? Number(process.argv[i + 1]) : 8080);
}
