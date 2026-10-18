# TXYDE: static site

The visual memory of the Circassian people: [txyde.com](https://txyde.com).

This is the clean static version of the WordPress site. It looks the same as the original (checked pixel by pixel at seven screen widths) but is plain HTML, CSS and a little JavaScript. The original WordPress export is kept in the parent folder for reference.

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

```bash
npm run dev     # build, serve on http://localhost:8080, rebuild when files change
npm run build   # build into dist/
```

To deploy, upload the contents of `dist/` to the web root of txyde.com.

**Team preview:** every push to `main` is built and published to GitHub Pages by `.github/workflows/pages.yml`. The preview is served from `https://<user>.github.io/<repo>/`, so the build adds the repo name to every link (`BASE_PATH`). It also leaves out analytics and tells search engines not to index it (`PREVIEW`).

## Folder structure

```
site/
├── build.js                 the build script (no dependencies)
├── src/
│   ├── site.json            site name, URL, menu, Google Analytics id
│   ├── layouts/base.html    the HTML shell around every page
│   ├── partials/            header, footer, mobile drawer, photo viewer
│   ├── pages/               one .html file per page → /<name>/
│   ├── categories/          one .json file per photo category → /<slug>/
│   └── templates/           the category page template
├── assets/                  copied as-is into dist/assets/
│   ├── css/                 tokens → base → layout → page CSS
│   ├── js/                  site.js (every page), gallery.js (categories)
│   └── img/                 brand/ (logo, favicons, diamonds) and home/
├── scripts/import_sheet.py  spreadsheet → src/categories/*.json
├── data/                    the spreadsheet (not committed) and REVIEW-NOTES.md
├── DESIGN-SYSTEM.md         colours, type, spacing and components
└── dist/                    generated output (not committed)
```

## Adding photos to a category

Photos live in `src/categories/<category>.json`. Add an entry to the `photos` list:

```json
{
  "title": "Quneitra city",
  "image": "https://cdn.txyde.com/03_Root_Final/F_SYR/20th/15_SYR_20th_Circassian+city+in+Jolan+hights.jpg",
  "thumb": "optional smaller image for the grid; falls back to image",
  "year": "20th",
  "country": "Syria",
  "city": "Quneitra",
  "tags": ["Circassian Architecture", "Rural planning", "Golan"],
  "description": "Quneitra city which was the main city in Golan heights…"
}
```

The filters are built from the data, so you never edit buttons by hand:

- **Places** buttons come from the `country` values (sorted A–Z).
- **Tags** buttons come from every `tags` entry (sorted A–Z). If no photo has tags, the Tags row is hidden.

### Importing from the photo archive spreadsheet

`homeland.json` and `diaspora.json` are generated from the team's Google Sheet, so edit the sheet rather than these files. Download the sheet as .xlsx into `data/`, then run:

```bash
pip install openpyxl               # once
python scripts/import_sheet.py     # rewrites the photos in homeland.json and diaspora.json
npm run build
```

The script splits the photos by the Location column and checks that every image loads. It lists any rows it skipped or found suspicious. The spreadsheet stays in `data/`, which is neither published nor committed, because it contains contact details. Open questions about the data are tracked in `data/REVIEW-NOTES.md`.

> Thumbnails: the grid currently loads the full-size image. Once there are many photos, add a `thumb` (about 600px wide) for each one. Pages will load much faster.

## Adding a category (for example Homeland)

1. Copy `src/categories/diaspora.json` to `src/categories/homeland.json`.
2. Change `slug`, `title`, `metaTitle` and the `photos`.
3. Rebuild. The page appears at `/homeland/`. Add it to the menu in `src/site.json` if needed.

Every category uses the same template, so adding ten more is the same amount of work as adding one.

## Adding a regular page

Create `src/pages/<name>.html`. It's published at `/<name>/`. Start it with front matter:

```html
---
title: About us - TXYDE
description: One-line summary for search engines
styles: home
---
<section class="section section--contained">…</section>
```

`styles` is optional: a comma-separated list of extra CSS files from `assets/css/`.

## CSS in one minute

- `tokens.css` holds every colour, font, size and radius as CSS variables. Change the design here.
- `base.css` covers typography, buttons, tags and the diamond heading.
- `layout.css` covers the page box, header, mobile menu, footer and section grid.
- `home.css` and `gallery.css` hold page-specific styles.

See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) for the full reference.

## What changed from the WordPress version

- About 1.1 MB of theme and plugin CSS/JS per page (WooCommerce, Elementor, sliders, emoji, jQuery and more) was replaced by about 35 KB of readable CSS and JS. Each page's HTML went from 140–190 KB to 4–11 KB.
- The theme's 72 KB icon font was replaced by three inline SVG icons.
- Images were renamed to plain Latin file names. A 640 KB `.bmp` became a lossless `.webp`, and the 590 KB portrait PNG became a 47 KB `.webp`.
- Removed: GoDaddy hosting tracker, WordPress feeds/oEmbed/REST links, LightGallery (loaded but unused). Kept: Google Analytics (`analyticsId` in `src/site.json`; clear it to disable).
- Fixed: on the Diaspora page, broken markup let the footer draw on top of the open photo viewer and stretched the footer wider than the page. Both now behave as on the other pages.

## Open items for the owners

See [SCALING-AND-UX-PLAN.md](SCALING-AND-UX-PLAN.md) for the plan to grow to 1,000+ photos and the speed and usability review.


- **Placeholder links**: the category-card tags, "More categories", the "Learn more" buttons and "See all notable figures" link to `#`. They also went nowhere on the WordPress site.
- **Pages not migrated yet**: `/about-us/`, `/support/` and `/circassion/`, `/new-adds/`. The menu links to About us and Support, which return 404 until those pages are added.
- **Archive images**: `cdn.txyde.com` currently returns 403 for every photo, on the live site too.
- **Fonts**: Cantata One and Open Sans were uploaded to WordPress but never applied. The site uses Georgia and Arial. See the typography section of DESIGN-SYSTEM.md to switch.
