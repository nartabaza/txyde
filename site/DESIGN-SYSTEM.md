# TXYDE Design System

The reference for anyone adding pages, category galleries or images to txyde.com.
Everything here describes what is already in the code. The source of truth is:

| File | Contains |
|---|---|
| `assets/css/tokens.css` | Every design token: colours, fonts, type scale, radii, layout values, breakpoint overrides |
| `assets/css/base.css` | Reset, heading classes, buttons, icons, tags, diamond heading |
| `assets/css/layout.css` | Boxed page, header, mobile drawer, footer, section grid |
| `assets/css/home.css` | Home page sections (loaded only by `index.html` via `styles: home`) |
| `assets/css/gallery.css` | Category gallery and photo viewer (loaded only on category pages) |

`tokens.css`, `base.css` and `layout.css` load on every page (see `src/layouts/base.html`).

## Contents

1. [Overview](#1-overview)
2. [Colour](#2-colour)
3. [Typography](#3-typography)
4. [Spacing and layout](#4-spacing-and-layout)
5. [Shape and elevation](#5-shape-and-elevation)
6. [Components](#6-components)
7. [Iconography and imagery](#7-iconography-and-imagery)
8. [Known inconsistencies kept on purpose](#8-known-inconsistencies-kept-on-purpose)
9. [How to extend](#9-how-to-extend)

---

## 1. Overview

TXYDE is a dark, archival interface: near-black page (`#050608`) with slightly lifted charcoal surfaces (`#111418`) for the header bar, cards and the About band, and off-white text (`#eef1f1`). Type is serif-led: body copy and headings both use Georgia, and only navigation uses Arial. Colour is held back for meaning: a muted heritage palette (forest, brick, teal, amber, rose, sand) marks categories and actions, with forest for Homeland, brick for Diaspora and teal for primary actions. The recurring brand motif is a row of three outlined diamonds, used as an ornament under card headings.

---

## 2. Colour

All tokens are defined in `:root` in `tokens.css`.

### Surfaces

| Token | Value | Used for |
|---|---|---|
| `--color-bg` | `#050608` | `html`, `.page`, `.site-header`, `.site-main`, viewer media panel |
| `--color-surface` | `#111418` | Header bar (`.site-header__inner`, sticky bar), `.category-card`, `.home-about`, `.photo-card`, viewer details panel |
| `--color-surface-footer` | `#101015` | `.site-footer` |
| `--color-surface-drawer` | `#191919` | `.drawer` background and its 60px bottom border |
| `--color-overlay` | `rgb(0 0 0 / 0.6)` | `.drawer-overlay` |

### Text

| Token | Value | Used for |
|---|---|---|
| `--color-text` | `#eef1f1` | Body text and all headings |
| `--color-text-soft` | `#d6dadf` | Long-form copy on surfaces (`.home-about__body`) |
| `--color-text-muted` | `#c4c7cd` | Section subtitles (`.home-voices__subtitle`) |
| `--color-text-footer` | `#bababa` | Footer text |
| `--color-text-on-light` | `#111418` | Text on `.btn--light`, `.btn--sand`, viewer button hover |
| `--color-text-on-teal` | `#e5e5e5` | Text on `.btn--teal` |

### Navigation and links

| Token | Value | Used for |
|---|---|---|
| `--color-nav` | `#f2f2f2` | Desktop nav links |
| `--color-nav-active` | `#c6c6c6` | Desktop nav hover and current page |
| `--color-drawer-link` | `#a6a6a6` | Drawer links and drawer close button |
| `--color-drawer-link-active` | `#ffffff` | Drawer link hover and current page |
| `--color-link` | `#006edf` | Default `a` colour, `.menu-toggle` icon, `::selection` background |

### Lines

| Token | Value | Used for |
|---|---|---|
| `--color-border` | `#4b5563` | `.tag` border. The gallery uses the same colour as `rgb(75 85 99 / alpha)` literals (see below) |
| `--color-hairline` | `rgb(255 255 255 / 0.1)` | Footer top border |

### Brand accents (the "diamond" palette)

| Token | Value | Role | Currently used by |
|---|---|---|---|
| `--color-forest` | `#2f6b45` | **Homeland** | `.category-card--homeland` |
| `--color-brick` | `#6b2f2f` | **Diaspora** | `.category-card--diaspora` |
| `--color-teal` | `#2f5f6b` | **Primary action** | `.btn--teal`, `.btn--teal-bright`, `.filter-button.is-active` |
| `--color-amber` | `#8a5a2f` | Reserved | Not used yet |
| `--color-rose` | `#b46b7a` | Reserved | Not used yet |
| `--color-sand` | `#e5d0be` | Secondary action | `.btn--sand` |

### Light button and icons

| Token | Value | Used for |
|---|---|---|
| `--color-button-light` | `#f3f4f6` | `.btn--light` background |
| `--color-button-light-hover` | `#ffffff` | `.btn--light:hover` |
| `--color-icon-muted` | `#65666c` | Back-to-top arrow icon |

### Gallery-local colours (candidates to promote to tokens)

These appear only in `gallery.css` as hard-coded values. They work, but a change to the palette will not reach them. Consider promoting them to tokens.

| Value | Where | Notes |
|---|---|---|
| `#dde7e1` | `.gallery__title`, `.filter-group__label`, `.viewer__meta-row dt` | Green-tinted heading colour |
| `#e6e8ec` | `.gallery` text colour, `.filter-button--primary` text | |
| `#c9d0d8` | `.filter-button--tag` text, `.viewer__description` | |
| `#aeb4bd` | `.viewer__counter`, `.viewer__meta-row dd` | |
| `#e9eef2` | `.photo-card__title` | |
| `#f2f7f8` | `.filter-button.is-active` text, viewer show/hide details text | |
| `#f3f5f7` | `.viewer__title`, `.viewer__close` / `.viewer__nav` text | |
| `#fff` | `.viewer__button:hover` background | Same value as `--color-button-light-hover` |
| `rgb(75 85 99 / 0.25–0.75)` | Borders on panel, cards, buttons, viewer | `--color-border` with alpha |
| `rgb(17 20 24 / 0.82–0.94)` | Filter panel gradient, primary filter bg, viewer close/nav bg | `--color-surface` with alpha |
| `rgb(5 6 8 / 0.55)` | Filter panel gradient end | `--color-bg` with alpha |
| `rgb(5 7 11 / 0.72–0.75)` | Tag filter bg, hide-details bg | Close to, but not equal to, `--color-bg` |
| `rgb(47 95 107 / 0.24)` | Active filter focus ring | `--color-teal` with alpha |
| `rgb(0 0 0 / 0.88)` | `.viewer` backdrop | Darker than `--color-overlay` |

---

## 3. Typography

### Font roles

| Token | Resolves to | Used for |
|---|---|---|
| `--font-serif` | `Georgia, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif` | Base stack |
| `--font-sans` | `Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", …, sans-serif` | Base stack |
| `--font-body` | `var(--font-serif)` | Body, buttons, filter buttons, viewer |
| `--font-heading` | `var(--font-serif)` | `h1`–`h4` and `.text-h1`–`.text-h4` |
| `--font-nav` | `var(--font-sans)` | Desktop nav and drawer links |

Always reference the role tokens (`--font-body`, `--font-heading`, `--font-nav`), not the base stacks.

> **Fonts uploaded but never applied.** Cantata One (headings) and Open Sans (UI) were uploaded to WordPress but the live theme never used them, so the migration kept Georgia/Arial. To switch later: add `@font-face` rules (e.g. at the top of `tokens.css`) and change `--font-heading` / `--font-body` in `tokens.css`. Nothing else needs to change.

### Type scale

Heading weights are fixed in `base.css`; sizes and line heights come from tokens and change at each breakpoint. Values are `font-size / line-height`.

| Role | Weight | ≥960px | 768–959px | 480–767px | <480px |
|---|---|---|---|---|---|
| Body (`--fs-body` / `--lh-body`) | 400 | 15 / 28px | 13 / 24px | 13 / 21px | 13 / 19px |
| H1 (`--fs-h1` / `--lh-h1`) | 500 | 50 / 60px | 43 / 51px | 38 / 45px | 30 / 36px |
| H2 (`--fs-h2` / `--lh-h2`) | 500 | 40 / 50px | 34 / 43px | 30 / 38px | 24 / 30px |
| H3 (`--fs-h3` / `--lh-h3`) | 400 | 30 / 40px | 26 / 34px | 23 / 30px | 18 / 24px |
| H4 (`--fs-h4` / `--lh-h4`) | 600 | 20 / 30px | 17 / 26px | 15 / 23px | 13 / 19px |
| Nav (`--fs-nav`) | 500 | 15px (line-height 60px) | 13px | 13px | 13px |
| Button (`--fs-button`) | 400 | 14px, line-height 1.2 (does not scale) | | | |
| Tag (`--fs-tag`) | inherit | 13px, line-height 1 (does not scale) | | | |

Paragraphs have `margin: 0 0 15px`. Headings have no margin; spacing comes from `.block` (see §4).

### Heading classes

`.text-h1` … `.text-h4` apply a heading's size without changing the semantic level. Use them to keep the document outline correct:

```html
<h2 class="text-h4">Homeland</h2>              <!-- semantic h2, looks like h4 -->
<p class="text-h4 block">The visual memory…</p> <!-- paragraph styled as h4 -->
<h1 class="text-h2 gallery__title">Diaspora</h1>
```

Gallery-only sizes use `rem` instead of tokens: filter label `0.78rem` (weight 900, uppercase, `letter-spacing: 0.11em`), primary filter `0.96rem`, tag filter `0.86rem` (`0.82rem` ≤768px), photo title `1.05rem`, viewer title `1.35rem`, viewer counter `0.92rem`.

---

## 4. Spacing and layout

### Breakpoints

| Width | Defined in | What changes |
|---|---|---|
| ≥1240px | `base.css`, `layout.css` | Desktop nav shown, hamburger and drawer hidden, sticky header, body gets side padding |
| 960–1239px | `tokens.css` | Narrower page and container |
| ≤959px | `tokens.css` | Smaller type scale, 728px page |
| ≤767px | `tokens.css`, `layout.css`, `home.css` | Fluid page, columns stack, gutter 0, section side padding, header becomes static and centred |
| ≤479px | `tokens.css` | Smallest type scale |
| ≤900px | `gallery.css` | Photo grid 2 columns; viewer stacks vertically |
| ≤768px | `gallery.css` | Photo grid 1 column; compact filter panel; mobile viewer |

Note the site breakpoints use `max-width: 767px` while the gallery uses `max-width: 768px`. Exactly at 768px the gallery is in its mobile state but the rest of the site is not.

### Widths

| Viewport | `--page-max` (boxed page) | `--container-max` (header, footer, contained sections) |
|---|---|---|
| ≥1240px | 1240px | 1220px |
| 960–1239px | 960px | 940px |
| 768–959px | 728px | 708px |
| ≤767px | `100%` (full width) | 708px (inherited; page is narrower, so effectively full width) |

### Spacing tokens

| Token | Default | ≤767px | Purpose |
|---|---|---|---|
| `--gutter` | 12px | 0px | Horizontal margin inside every column (`.block`, `.home-hero__title`, `.gallery`) |
| `--block-gap` | 40px | 20px | Space below every `.block` |
| `--section-pad-x` | 0px | 16px | Side padding of `.section`; also added to footer side padding |
| `--page-offset` | 25px | 25px | Space around the boxed page (`body` padding) |
| `--header-height` | 100px | 100px | `min-height` of `.site-header` |

### Boxed page model

```
html (--color-bg)
└─ body               padding: 25px 0 (≥1240px: 25px all round)
   └─ .page           max-width: --page-max, centred, box-shadow
      ├─ header.site-header
      ├─ main.site-main   padding-top: 30px
      └─ footer.site-footer
   .drawer, .drawer-overlay, .viewer   (outside .page, fixed)
```

### Sections, rows, columns

```html
<section class="section">            <!-- full width of the boxed page (home) -->
  <div class="row">                  <!-- flex, wraps -->
    <div class="col-1-2 col-center"> <!-- 50% wide, offset 25% -->
      <div class="block">…</div>
    </div>
  </div>
</section>
```

| Class | Effect |
|---|---|
| `.section` | Side padding `--section-pad-x` |
| `.section--contained` | Also caps width at `--container-max` and centres it |
| `.row` | `display: flex; flex-wrap: wrap; align-items: flex-start` |
| `.col-1-2` / `.col-1-3` / `.col-2-3` | 50% / 33.333% / 66.666%; all become 100% at ≤767px |
| `.col-center` | `margin-left: 25%` (centres a `.col-1-2`); removed at ≤767px |
| `.text-center` | `text-align: center` |

**Full-width vs contained.** The home page uses plain `.section`, so its rows span the whole boxed page (1240px on desktop). Every other page (currently the category template) wraps content in `.section .section--contained`, which aligns it with the header and footer (1220px on desktop).

### The `.block` primitive

```css
.block {
  display: flow-root;
  margin: 0 var(--gutter) var(--block-gap);
}
```

Every piece of content inside a column is a `.block`. It gives the same side gutter and bottom gap everywhere, so vertical rhythm comes from one token. `display: flow-root` creates a new block formatting context: margins of children (for example the 15px bottom margin of the last `<p>`) stay inside the block instead of collapsing through it, so the gap below a block is always exactly `--block-gap` plus whatever the content adds. It also contains floats. `.category-card` and `.figure-card` use `flow-root` for the same reason.

Section-specific vertical padding is set per section in `home.css` (e.g. `.home-hero` 120px top / 80px bottom, `.home-categories` 110px top, `.home-cta` 70px bottom, `.home-cta--last` 110px bottom). There is no vertical spacing scale token.

---

## 5. Shape and elevation

### Radius scale

| Token | Value | Used by |
|---|---|---|
| `--radius-xs` | 3px | `.btn`, `.menu-toggle`, `.photo-card__trigger` |
| `--radius-sm` | 10px | `.photo-card__image`, `.viewer__image` |
| `--radius-md` | 12px | `.photo-card` |
| `--radius-lg` | 18px | `.filter-panel` (16px hard-coded at ≤768px) |
| `--radius-xl` | 20px | `.category-card` |
| `--radius-image` | 25px | `.category-card__frame` |
| `--radius-portrait` | 150px | `.figure-card__portrait` |
| `--radius-pill` | 999px | `.tag`, `.filter-button`, viewer buttons |

One radius is hard-coded: `.viewer__media` / `.viewer__details` use `14px`.

### Shadows

| Element | Value |
|---|---|
| `.page` | `0 0 15px rgb(0 0 0 / 0.06)` |
| Sticky header bar | `0 2px 5px 0 rgb(0 0 0 / 0.1)` |
| `.filter-panel` | `0 14px 36px rgb(0 0 0 / 0.22)` |
| `.filter-button.is-active` | `0 0 0 3px rgb(47 95 107 / 0.24)` (teal ring) |
| `.photo-card` | `0 10px 30px rgb(0 0 0 / 0.35)` |
| `.viewer__media`, `.viewer__details` | `0 18px 50px rgb(0 0 0 / 0.55)` |
| `.viewer__close`, `.viewer__nav` | `0 10px 30px rgb(0 0 0 / 0.55)` |

There are no shadow tokens.

---

## 6. Components

### Header

**Purpose:** logo and main navigation. Partial: `src/partials/header.html`. Nav items are generated by `build.js` from `src/site.json` (`nav` array).

```html
<header class="site-header" id="top">
  <div class="site-header__bar">
    <div class="site-header__container">
      <div class="site-header__inner">
        <a class="site-logo" href="/"><img src="/assets/img/brand/logo-mark.png" width="60" height="60" alt="TXYDE"></a>
        <nav class="site-nav" aria-label="Main menu">
          <ul class="site-nav__list">
            <li class="site-nav__item"><a class="site-nav__link" href="/diaspora/" aria-current="page"><span>Diaspora</span></a></li>
          </ul>
        </nav>
        <button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">…menu icon…</button>
      </div>
    </div>
  </div>
</header>
```

- **Tokens:** `--header-height`, `--container-max`, `--color-bg`, `--color-surface`, `--font-nav`, `--fs-nav`, `--color-nav`, `--color-nav-active`, `--color-link`, `--radius-xs`.
- **Layout:** the bar is absolutely positioned 61px from the top of the header; the logo block is 60px tall with 15px vertical padding.
- **States:**
  - Hover and current page (`aria-current="page"`, set automatically by `build.js`): link colour `--color-nav-active`.
  - **Sticky (≥1240px):** `site.js` adds `.is-sticky` to `.site-header__bar` once `scrollY` passes the bar's height. The bar becomes fixed at top, 61px tall, `--color-surface` at 0.97 opacity, with a shadow and a 0.3s slide-in animation; the logo shrinks to 35px max height and link line height drops to 30px. Below 1240px the class is still toggled but has no styles.
  - **<1240px:** `.site-nav` is hidden and `.menu-toggle` (34×34px, 22px icon, `--color-link`) is shown.
  - **≤767px:** bar becomes static with `--color-surface` background, logo centred, toggle at `top: 40px; right: 10px`.
- **Viewer open:** `body.viewer-open .site-header { display: none; }`.

### Mobile drawer

**Purpose:** slide-out navigation below 1240px. Partial: `src/partials/drawer.html`. Hidden entirely at ≥1240px.

```html
<div class="drawer" id="drawer" aria-hidden="true" inert>
  <div class="drawer__close-row">
    <button class="drawer__close" type="button" aria-label="Close menu">…close icon…</button>
  </div>
  <nav class="drawer__nav" aria-label="Mobile menu">
    <ul>
      <li class="drawer__item"><a class="drawer__link" href="/diaspora/">Diaspora</a></li>
    </ul>
  </nav>
</div>
<div class="drawer-overlay"></div>
```

- **Tokens:** `--color-surface-drawer`, `--color-drawer-link`, `--color-drawer-link-active`, `--color-overlay`, `--font-nav`, `--fs-nav`.
- **Geometry:** 250px wide, fixed to the right, slides from `right: -250px` to `0` in 0.3s. The body shifts `left: -125px` at the same time. Items are separated by `rgb(255 255 255 / 0.03)` lines.
- **States:** open = `.drawer.is-open` + `.drawer-overlay.is-open` + `body.drawer-open` (all set by `site.js`, which also updates `aria-hidden`, `inert` and the toggle's `aria-expanded`). Closes on the close button, overlay click, Escape, or resizing to ≥1240px. Link hover/current page: `--color-drawer-link-active`.

### Footer

**Purpose:** back-to-top button and copyright. Partial: `src/partials/footer.html`.

```html
<footer class="site-footer">
  <div class="site-footer__container">
    <a class="btn btn--light back-to-top" href="#top" aria-label="Back to top">…up icon…</a>
    <p class="site-footer__copy">TXYDE Copyright<sup>©</sup> 2026</p>
  </div>
</footer>
```

- **Tokens:** `--color-surface-footer`, `--color-text-footer`, `--color-hairline` (top border), `--container-max`, `--section-pad-x`, `--color-icon-muted`.
- Centred text; container padding `30px (section-pad-x + 12px) 45px`.
- `.back-to-top` is a 42×42px `.btn--light` with a 20px icon; `site.js` makes it smooth-scroll to the top. Hover follows `.btn--light`.
- The year is filled in at build time. `.site-footer__copy` has no styles of its own.

### Buttons

**Purpose:** all calls to action. Defined in `base.css`. Use on `<a>` or `<button>`.

```html
<a class="btn btn--teal btn--lg" href="#">Learn more</a>
```

Base `.btn`: inline-flex, `padding: 10px 20px`, `gap: 10px`, `--radius-xs`, `--font-body`, `--fs-button` (14px), weight 400, line-height 1.2, colour/background transition 0.2s.

| Class | Background | Text | Hover | Used on |
|---|---|---|---|---|
| `.btn--light` | `--color-button-light` | `--color-text-on-light` | bg `--color-button-light-hover` | Back-to-top |
| `.btn--teal` | `--color-teal` | `--color-text-on-teal` (`#e5e5e5`) | none | "Learn more" (About), "See all notable figures" |
| `.btn--teal-bright` | `--color-teal` | `#fff` (hard-coded) | none | "More categories" only (see §8) |
| `.btn--sand` | `--color-sand` | `--color-text-on-light` | none | Figure-card "Learn more" |
| `.btn--lg` (size) | | | | `transform: scale(1.1)`; the layout box keeps its normal size |

There are no focus, active or disabled styles for `.btn`.

**`.button-block`** centres a button inside a `.block`:

```html
<div class="block button-block">
  <a class="btn btn--teal-bright btn--lg" href="#">More categories</a>
</div>
```

### Tags

**Purpose:** pill-shaped topic labels. Defined in `base.css`.

```html
<div class="tag-list">
  <a class="tag" href="#">Village life</a>
  <a class="tag" href="#">Costume</a>
</div>
```

- `.tag-list`: flex, wraps, `gap: 8px`, `margin-top: 10px`.
- `.tag`: `padding: 6px 10px`, 1px `--color-border` border, `--radius-pill`, transparent background, inherits text colour, `--fs-tag`, line-height 1.
- **States:** default `opacity: 0.9`; hover `opacity: 1`.

### Diamond heading

**Purpose:** the brand ornament under a heading: a fading horizontal rule plus the three-diamond mark in an accent colour. Defined in `base.css`.

```html
<div class="block diamond-heading category-card__header">
  <h2 class="text-h4">Homeland</h2>
</div>
```

- `::before`: 1px line, 28px from the bottom, gradient `transparent → rgb(255 255 255 / 0.35) → transparent`.
- `::after`: 72×24px, `left: 5%`, `bottom: 2px`, filled with `var(--accent, #fff)` and masked by `assets/img/brand/diamonds.svg`.
- Adds `padding-bottom: 40px`.
- **Colour:** set `--accent` on any ancestor. `.category-card--homeland` / `--diaspora` already do this. Without `--accent` the diamonds are white.

### Category card

**Purpose:** entry point to a category on the home page. Defined in `home.css`.

```html
<div class="col-1-2">
  <article class="category-card category-card--homeland">
    <div class="block diamond-heading category-card__header">
      <h2 class="text-h4">Homeland</h2>
    </div>
    <div class="block category-card__media">
      <div class="category-card__frame">
        <img src="/assets/img/home/homeland-card-circassian-soldiers-trial.jpg" width="400" height="400" alt="…">
      </div>
    </div>
    <div class="block category-card__tags">
      <div class="tag-list"><a class="tag" href="#">Village life</a></div>
    </div>
  </article>
</div>
```

- **Tokens:** `--color-surface`, `--radius-xl`, `--radius-image`, `--accent`.
- **Variants:** `.category-card--homeland` (`--accent: var(--color-forest)`), `.category-card--diaspora` (`--accent: var(--color-brick)`). The accent colours the 10px left border and the diamond heading.
- `margin: 5%`; header padding `2%` top / `5%` left; tags `5%` left. At ≤767px the card gets `padding: 0 5%` and the header `5%` top padding.
- **States:** none (the card itself is not a link).

### Figure card

**Purpose:** portrait, name and button in the "Voices of History" row. Defined in `home.css`.

```html
<div class="col-1-3">
  <article class="figure-card">
    <div class="block figure-card__image">
      <div class="figure-card__portrait">
        <img src="/assets/img/home/portrait-shumaf-chesebiev.webp" width="299" height="300" alt="Shumaf Beslanovich Chesebiev">
      </div>
    </div>
    <h3 class="block text-center figure-card__name">Чесебиев Шумаф Бесланович</h3>
    <div class="block button-block">
      <a class="btn btn--sand" href="#">Learn more</a>
    </div>
  </article>
</div>
```

- **Tokens:** `--radius-portrait` (150px) on `.figure-card__portrait`; the image fills 100% of the column width.
- `margin: 0 10px 20px`; name has `margin-bottom: 5px` (overrides the `.block` gap).
- **States:** button only (`.btn--sand`, no hover).

### Gallery filter panel and filter buttons

**Purpose:** filter photos on a category page by place (country) and tag. Template: `src/templates/category.html`; buttons generated by `build.js` from the category JSON; behaviour in `assets/js/gallery.js`.

```html
<div class="section section--contained">
  <div class="gallery">
    <div class="gallery__inner">
      <h1 class="text-h2 gallery__title">Diaspora</h1>
      <div class="filter-panel" role="group" aria-label="Photo filters">
        <div class="filter-group">
          <div class="filter-group__label">Places</div>
          <div class="filter-group__buttons">
            <button class="filter-button filter-button--primary is-active" type="button" data-filter-place="all">Show All</button>
            <button class="filter-button filter-button--primary" type="button" data-filter-place="Syria">Syria</button>
          </div>
        </div>
        <div class="filter-group">
          <div class="filter-group__label">Tags</div>
          <div class="filter-group__buttons">
            <button class="filter-button filter-button--tag is-active" type="button" data-filter-tag="all">All Tags</button>
            <button class="filter-button filter-button--tag" type="button" data-filter-tag="education">Education</button>
          </div>
        </div>
      </div>
      <div class="photo-grid">…photo cards…</div>
    </div>
  </div>
</div>
```

- `.gallery`: gutter margins, 40px bottom margin, faint "star field" `::before` (five radial-gradient dots, 220px tile, 0.35 opacity). `.gallery__inner` is centred.
- `.gallery__title`: `#dde7e1`, 1px bottom border, `letter-spacing: -0.02em`.
- `.filter-panel`: `min(980px, 100%)` wide, `--radius-lg`, gradient from surface to bg, shadow (§5). Groups after the first get a top divider and 16px spacing.
- **Variants:**

| Class | Padding | Background | Text | Size / weight |
|---|---|---|---|---|
| `.filter-button--primary` | 10px 16px (9px 13px ≤768px) | `rgb(17 20 24 / 0.86)` | `#e6e8ec` | 0.96rem / 800 |
| `.filter-button--tag` | 7px 11px (7px 10px ≤768px) | `rgb(5 7 11 / 0.72)` | `#c9d0d8` | 0.86rem / 750 |

- **States:** hover lifts 1px and `brightness(1.06)`; `.is-active` gets `--color-teal` background, `#f2f7f8` text and the teal ring. One active button per group; `gallery.js` moves `.is-active` on click.
- The Tags group is omitted when no photo in the category has tags.

### Photo card

**Purpose:** a thumbnail in the gallery grid that opens the viewer. Generated by `build.js`; all details travel as `data-*` attributes.

```html
<article class="photo-card" data-country="Syria" data-tags="education,school" data-full="https://cdn.txyde.com/…jpg"
         data-title="The Adyghe School in Syria" data-year="20th" data-locality="Quneitra"
         data-tags-display="Education, School" data-description="…">
  <button class="photo-card__trigger" type="button" aria-label="View The Adyghe School in Syria">
    <img class="photo-card__image" src="https://cdn.txyde.com/…jpg" alt="The Adyghe School in Syria" loading="lazy" decoding="async">
  </button>
  <h2 class="photo-card__title">The Adyghe School in Syria</h2>
</article>
```

- **Grid:** `.photo-grid` is a centred wrapping flex row with 20px gaps. Cards are `calc(33.333% - 20px)` (3 columns), `calc(50% - 20px)` at ≤900px, 100% at ≤768px.
- **Card:** 18px padding, `--color-surface`, `--radius-md`, border `rgb(75 85 99 / 0.55)`, shadow.
- **Image:** 220px tall, full width, `object-fit: cover`, `object-position: top`, `--radius-sm`, 1px border.
- **Title:** `#e9eef2`, 1.05rem, weight 400, line height `--lh-h3`, `letter-spacing: -0.02em`.
- **States:** hover on the trigger lifts the image 2px with `brightness(1.06)`; filtered-out cards get the `hidden` attribute (`display: none`).

### Photo viewer

**Purpose:** full-screen lightbox with image, counter and details panel. Partial: `src/partials/viewer.html` (added after `.page` on category pages only).

```html
<div class="viewer" aria-hidden="true">
  <div class="viewer__shell" role="dialog" aria-modal="true" aria-label="Photo viewer">
    <button class="viewer__button viewer__close" type="button" aria-label="Close viewer">&times;</button>
    <button class="viewer__button viewer__nav viewer__nav--prev" type="button" aria-label="Previous photo">&#8249;</button>
    <div class="viewer__media">
      <div class="viewer__stage"><img class="viewer__image" src="data:," alt=""></div>
      <div class="viewer__counter"></div>
      <button class="viewer__button viewer__show-details" type="button">Show details</button>
    </div>
    <aside class="viewer__details">
      <h2 class="viewer__title"></h2>
      <dl class="viewer__meta">
        <div class="viewer__meta-row"><dt>Year:</dt><dd data-field="year"></dd></div>
        <!-- Country, Region, Locality, Sub-locality, Tags rows -->
      </dl>
      <p class="viewer__description"></p>
      <button class="viewer__button viewer__hide-details" type="button">Hide details</button>
    </aside>
    <button class="viewer__button viewer__nav viewer__nav--next" type="button" aria-label="Next photo">&#8250;</button>
  </div>
</div>
```

- **Layout:** backdrop `rgb(0 0 0 / 0.88)`; shell `min(1320px, 96vw)` × `min(860px, 100dvh - 56px)`. Media panel (`--color-bg`) flexes; details panel (`--color-surface`) is fixed at 360px. Both panels: 14px radius, border, large shadow. Image uses `object-fit: contain`, `object-position: top center`. Meta rows are a two-column grid (112px label, 104px at ≤768px).
- **Buttons:** close (46×46px, top-right) and prev/next (48×64px, vertically centred at the sides) are fixed pills with `rgb(17 20 24 / 0.94)` background. Show/hide details are pills with `#f2f7f8` text, weight 800; show-details is black (`#000`) so it does not pull the eye from the photo, hide-details is near-black.
- **States:**
  - Open: `.viewer.is-open` (display flex) and `body.viewer-open` (hides header; body scroll locked).
  - Details hidden: `.viewer.details-hidden` hides the details panel and reveals "Show details". Wider than 768px, the photo then fills the whole screen on a black background, centred.
  - Hover on any `.viewer__button`: white background, `--color-text-on-light` text.
  - Disabled: `.viewer__nav:disabled` at 0.35 opacity, `not-allowed` cursor (set when only one photo is visible).
  - Tags row is hidden when the photo has no tags; empty fields show "Unknown".
  - Keyboard: Escape closes, Left/Right arrows step. Clicking the backdrop closes.
- **≤900px:** shell stacks vertically and scrolls; details go full width.
- **≤768px:** prev/next move to the bottom centre (54×54px), close moves to `10px/10px`, padding accounts for `env(safe-area-inset-bottom)`.

---

## 7. Iconography and imagery

### Icons

Three inline SVG icons are defined in `build.js` (`ICONS`), extracted from the old theme's icon font. They render as `<svg class="icon" viewBox="0 0 1000 1000" aria-hidden="true">` and are inserted into partials with `{{{ icons.menu }}}`, `{{{ icons.close }}}`, `{{{ icons.up }}}`.

| Icon | Used in |
|---|---|
| `menu` | `.menu-toggle` |
| `close` | `.drawer__close` |
| `up` | `.back-to-top` |

`.icon` is `1em × 1em` and `fill: currentColor`, so size it with `font-size` and colour it with `color` on the parent. The viewer uses text characters instead (`&times;`, `&#8249;`, `&#8250;`).

### Brand assets (`assets/img/brand/`)

| File | Use |
|---|---|
| `logo-mark.png` | Header logo (60×60, shown at max 60px tall, 35px when sticky) |
| `diamonds.svg` | Three outlined diamonds (72×24, 12px squares rotated 45°, 2px stroke, `rx="2"`). Used only as a CSS mask in `.diamond-heading::after`, so its stroke colour is irrelevant; the colour comes from `--accent` |
| `favicon-32.png`, `favicon-192.png`, `favicon-180.png` | Favicons / Apple touch icon |

### Images

- **Site imagery** (home cards, portraits) lives in `assets/img/` (`assets/img/home/` for the home page) and is copied as-is to `dist/`. Names are descriptive and kebab-case, e.g. `homeland-card-circassian-soldiers-trial.jpg`. Always include `width`, `height` and `alt`.
- **Archive photos** are served from `https://cdn.txyde.com/…` and referenced from `src/categories/<slug>.json`. Each photo has `title`, `image`, optional `thumb` (falls back to `image`), `year`, `country`, `city`, `tags`, `description`. Thumbnails get `loading="lazy"` and `decoding="async"`.
- **Aspect handling:**
  - Gallery thumbnails: fixed 220px height, `object-fit: cover`, `object-position: top` (keeps faces and skies; crops the bottom).
  - Viewer: `object-fit: contain`, `object-position: top center`, never cropped.
  - Category card and figure portrait images have **no** `object-fit`; they display at their natural ratio inside the rounded frame. The current files are square (400×400, 768×768, 299×300), so use square images there.

---

## 8. Known inconsistencies kept on purpose

The migration reproduced the WordPress UI exactly, including these quirks. Owners should decide on each:

- [ ] **Two teal button text colours.** "More categories" uses `#fff` (`.btn--teal-bright`); "Learn more" and "See all notable figures" use `#e5e5e5` (`.btn--teal`). Pick one and drop the other modifier.
- [ ] **Lowercase "circassian"** in the hero tagline ("The visual memory of the circassian people"). `site.json` description capitalises it.
- [ ] **Placeholder links.** Category-card tags, "More categories", "Learn more" (About and figure cards) and "See all notable figures" all link to `#`.
- [ ] **Duplicated portrait.** The third figure card repeats Batyrbek Almov (same image and name as the first).
- [ ] **"The South Temple" year mismatch.** In `src/categories/diaspora.json` the year is `19th` but the CDN path is `/F_JRD/20th/17_JRD_20th_The+South+Temple.jpg`.

Smaller code-level oddities, also inherited:

- [ ] `.home-hero__intro` border (`rgb(0 0 0 / 0.1)`) and nav item dividers (`rgb(0 0 0 / 0.05)`) are black on a black page, so they are invisible.
- [ ] `--color-amber` and `--color-rose` are defined but unused.
- [ ] Only `.btn--light` has a hover state; no button has a focus style.

---

## 9. How to extend

### Add a colour token

1. Add it to `:root` in `tokens.css` under the right group, with a comment saying where it is used:
   ```css
   --color-heading-tint: #dde7e1;   /* gallery headings, viewer labels */
   ```
2. Replace the hard-coded value with `var(--color-heading-tint)` everywhere it appears (search the CSS for the hex).
3. Add a row to the matching table in §2 of this document.

To use an existing colour with transparency, keep the `rgb(r g b / alpha)` form used in the code (e.g. `rgb(75 85 99 / 0.55)` for `--color-border`).

### Add a new category accent (e.g. a third category using amber)

The accent palette already has unused `--color-amber` and `--color-rose`.

1. **Card variant** in `home.css`, next to the existing two:
   ```css
   .category-card--crafts { --accent: var(--color-amber); }
   ```
2. **Markup** on the home page: copy a `.col-1-2 > .category-card` block in `src/pages/index.html`, change the modifier, heading, image and tags. The diamond heading and left border pick up the accent automatically. (Two cards fill a row; a third wraps to a new row.)
3. **Gallery page:** create `src/categories/<slug>.json` with `slug`, `title`, `metaTitle`, `description`, `placesLabel` and `photos` (same shape as `diaspora.json`). `build.js` builds `/<slug>/` from `templates/category.html` automatically. Add it to `nav` in `src/site.json` if it should appear in the menu.
4. Update the accent table in §2 so the colour is marked as taken.

Homeland already owns forest (`--color-forest`); its gallery only needs `src/categories/homeland.json`.

### Create a new component

1. **Decide the scope.** Used on every page: `base.css` (element-level) or `layout.css` (structural). One page type only: its own stylesheet (`home.css`, `gallery.css`, or a new `assets/css/<name>.css` listed in the page's front matter as `styles: <name>`).
2. **Name with BEM**, like the existing code: `.component`, `.component__part`, `.component--variant`, and `.is-*` for JS-driven state (`.is-open`, `.is-active`, `.is-sticky`).
3. **Use tokens only:** colours from §2, fonts from the role tokens, sizes from the type scale, radii from §5, spacing via `--gutter` / `--block-gap`. If you need a new value more than once, add a token first.
4. **Place it in the grid:** wrap it in `.section > .row > .col-* > .block` so gutters and gaps match the rest of the site; use `.section--contained` on any page other than home.
5. **Accent support:** if the component should follow a category colour, read `var(--accent)` and let the parent set it, as `.category-card` and `.diamond-heading` do.
6. **Check all breakpoints:** 1240, 960, 768, 480 (and 900/768 for gallery-adjacent work). Most sizing adapts automatically via tokens.
7. **Document it** here in §6: purpose, classes, a snippet, tokens, states.
