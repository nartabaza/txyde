# Scaling and UX plan

Planning notes from 18 October 2026. The question was: can the site handle 1,000+ photos added in batches of about 200, and what slows it down or gets in the way of visitors on laptops and phones today?

Nothing here has been built yet. Each item says whether it changes what visitors see.

## Summary

1. **Keep the static architecture.** At 1,000 photos the site is still a few small files and a build that takes under a second. A database or dynamic server would add cost and upkeep without fixing anything that is actually broken.
2. **Images are the problem.** The grid loads every original file, some of them uncompressed `.bmp` files. Fix this before the next batch. The fix needs no visual change.
3. **The filter panel and page length will break the mobile experience before anything technical does.** With 1,000 photos, a phone visitor would scroll through about **9 screens of filter buttons** before seeing the first photo. Fixing this does change the design, so several options are listed for the team to choose from.
4. **The photo viewer has a few behaviour gaps on phones.** The biggest is that the phone's Back button leaves the page instead of closing the photo.

## How this was checked

- Read the full source: the build script, templates, CSS, JavaScript and the import script.
- Rendered the Homeland and Diaspora pages in Chromium at a phone size (390 × 844, an iPhone 14) and a common laptop size (1366 × 768).
- Built a **simulated 1,000-photo Homeland page** from the real data, adding new tags at the rate the current data shows, to see what happens at the target size.
- Limit: the image server `cdn.txyde.com` couldn't be reached from the test machine, so placeholder images were used. Real file sizes still need measuring. See [Open questions](#open-questions).

### Key numbers

| | Today (Homeland, 66 photos) | Simulated 1,000 photos |
|---|---|---|
| Page file size (compressed) | 9 KB | 66 KB: fine |
| Time to apply a filter | under 30 ms | about 20 ms: fine |
| Tag buttons | 31 | 332 |
| Filter panel height, **phone** | 1,118 px | **7,081 px** |
| Scrolling before the first photo, **phone** | 1.6 screens | **8.7 screens** |
| Scrolling before the first photo, laptop | 0.9 screen | 2.7 screens |
| Page length, phone | 28 screens | 409 screens |
| Page length, laptop | 11 screens | 156 screens |
| Place + tag combinations with **no photos** | 76% (Diaspora: 87%) | 78% |

What this shows: the code itself scales fine. The weak points are the image files, the size of the filter panel and the length of the page.

---

## Part 1: Architecture

### How it works today

- Photos are stored on `cdn.txyde.com`, not in the code repository (the repository is about 0.5 MB).
- The team's spreadsheet is the source of the photo details. `scripts/import_sheet.py` turns it into one JSON file per category, and `build.js` turns those into plain HTML pages.
- Each category is a single page that contains every photo card. Filtering only hides cards, and the browser lazy-loads images as you scroll.

### When each part stops being enough

| Part | Fine until | What breaks | Fix |
|---|---|---|---|
| Image files (no thumbnails) | **Now** | Phones download full originals for every card. Scrolling 100 photos could mean hundreds of MB. | Generate a small grid image and a medium viewer image for each photo (P1 below) |
| One page per category | ~300 photos per category | The filter panel and page length get too big on phones | Paging or "Load more" (U2 below) |
| Manual import (download sheet → run script → push) | Any size, but it depends on one person | Every batch needs a developer | Automate it with GitHub Actions (A1 below) |
| Spreadsheet as the source | ~1,000–3,000 rows, or until several editors and approval steps are needed | Edit conflicts, no approval status, no links between Stories and photos | Airtable, Notion or a headless CMS feeding the same static build |
| Static site in general | ~5,000+ photos, or features like free-text search, public uploads or logins | Needs a search service or a server | Add a hosted search service to the static site before considering a full rebuild |

### Architecture actions

- **A1. Automate the import.** A GitHub Action that, on a button press or schedule, downloads the sheet, checks every image link, makes the thumbnails, rebuilds and publishes. The team keeps working only in the spreadsheet. *No visual change.*
- **A2. Make the import script stricter.** Convert `.bmp` automatically. Reject formats that browsers can't show reliably (`.tif`, `.heic`), instead of letting them appear as broken tiles. *No visual change.*
- **A3. Revisit the database question** at 3,000–5,000 photos, or when the team needs approval states, several editors at once, or Stories linked to photos.

---

## Part 2: Speed and usability findings

Findings are split into three groups:
- **Code-only:** faster or more reliable, and looks the same.
- **Behaviour fixes:** the design looks the same, but something works better.
- **Design options:** changes what visitors see, so the team decides.

### Code-only (no visual change)

| # | Finding | Fix | Impact |
|---|---|---|---|
| **P1** | The grid and the viewer both load the original file. Four originals are `.bmp` (uncompressed). | Generate a ~600 px wide WebP for the grid and a ~1,600 px version for the viewer. Keep originals as the archive. The grid crop stays exactly the same. | **Very high**: likely 10–50× less data on phones |
| P2 | The viewer starts loading the next photo only when you press Next. | Preload the previous and next photos in the background. | High: Next feels instant |
| P3 | All grid images are lazy-loaded, including the first row, which is already on screen on laptops. | Load the first 3–6 images immediately and at high priority. | Medium: the first photos appear sooner |
| P4 | The faint star-field background uses a blur filter (0.2 px, not visible) over the whole gallery. At 1,000 photos that is an element over 100,000 px tall, which phones handle poorly. | Remove the blur. The star field stays. | Medium: smoother scrolling on phones |
| P5 | CSS and JS files have fixed names. After an update, returning visitors may keep the old version from their cache. | Add a version number to file links at build time. Set long cache times for images on the CDN. | Medium: avoids "the site looks broken" after updates |
| P6 | Not yet confirmed: whether the production host and the CDN compress pages and send cache headers. | Check and enable compression (gzip or brotli) and caching. | Medium |

### Behaviour fixes (design unchanged)

| # | Finding | Fix | Impact |
|---|---|---|---|
| **B1** | On phones, pressing **Back** while a photo is open leaves the page entirely, losing the visitor's place and filters. Visitors expect Back to close the photo. | Make Back close the viewer. | **High** on mobile |
| B2 | No swipe in the viewer on phones. You have to tap the small arrows at the bottom. | Add left/right swipe. The arrows stay. | High on mobile |
| B3 | When moving to the next photo on a slow connection, the new title and description appear while the previous image is still showing. | Show the new text only once its image has loaded, or dim the old image while loading. | Medium |
| B4 | You can't link to a single photo or a filtered view. Sharing a photo means sharing the whole page. | Put the open photo in the address (for example `/homeland/#photo-13`) so links open it directly. | Medium, and helps the team share photos on social media |
| B5 | Keyboard and screen-reader users: focus stays on the grid behind the open viewer, and Tab moves through the hidden page. | Move focus into the viewer, keep it there while open, and return it to the card on close. | Medium: accessibility |
| B6 | If a place + tag combination has no photos (76–87% of combinations), the grid just goes empty with no explanation. | Show a short message such as "No photos match these filters" and a reset button. This is a small addition in the existing style. | Medium |

### Design options (the team decides)

Each one lists scenarios from the smallest change to the largest. The recommended one is marked ★.

#### U1. The filter panel is too big, especially on phones

The problem: every tag gets a button, even tags used on a single photo (21 of 30 on Homeland, 24 of 32 on Diaspora). Tags also stay visible when the selected place has no photos with that tag. On a phone today the panel is already taller than a full screen. At 1,000 photos it would be about 9 screens.

- **Scenario A: Clean up the data only (no design change).** Merge spelling and capitalisation duplicates ("students" / "Students"), and only make buttons for tags used on at least 3 photos. Rare tags still show in the photo details. This could cut the buttons by about two thirds, but they will grow again as photos are added.
- **Scenario B ★: Hide tags that have no matching photos.** When a place is selected, show only the tags that exist in that place, optionally with counts ("Costume · 12"). It looks the same and the panel shrinks as soon as a place is picked. Combine with A.
- **Scenario C ★ for phones: Collapse the tags.** Show the Places row and a "Tags (31)" button that opens the tag list. Use it on phones only, or on all screens. The buttons keep their current style.
- **Scenario D: Show the most-used tags, plus "More tags".** Show about 12 tags and keep the rest behind an expander.
- **Scenario E: A "Filters" button on phones that opens the filters in a panel sliding up from the bottom.** Laptops stay as they are. This is the common pattern in shopping and photo apps, but the biggest visual change on mobile.

Recommendation: **A + B now**, then **C on phones** once a category passes about 150 photos. This keeps the current look and solves the problem the team noticed.

#### U2. Page length at 1,000 photos

On phones the grid is one card per row, about 300 px each. At 1,000 photos that is a 409-screen page, and the footer is practically out of reach.

- **Scenario A ★: "Load more" button.** Show the first 30–60 matching photos and a button for the next batch. The grid looks the same. Filters still search all photos.
- **Scenario B: Numbered pages** (1, 2, 3 …). Easier to come back to "page 4", but feels more like a catalogue.
- **Scenario C: Two columns on phones.** Smaller cards, half the scrolling. This is a visible design change to the card size and should be mocked up first.
- **Scenario D: Split big categories into sub-pages**, for example by place (Homeland → Adygea, Kabardino-Balkaria, …). Also good for search engines, but a bigger change to navigation.

Recommendation: **A** when any category passes about 200 photos. Consider **C** separately as a mobile design decision.

#### U3. Small layout issues in the viewer

- On a 1366 × 768 laptop the Next arrow and the Close button sit on top of the edge of the details panel. *Option:* move them a few pixels outward, or inside the panel edges.
- On phones there is empty space under the photo counter, reserved for the hidden "Show details" button, and the "Hide details" button is half covered by the arrow bar. *Option:* tighten the spacing so the details panel starts higher.
- Tag buttons are 32 px tall. That meets the accessibility minimum (24 px) but is below the 44–48 px that Apple and Google recommend for fingers. *Option:* keep it, since the gaps between buttons help. Revisit if the team gets complaints about mis-taps.

### Browser support

- Works in current Chrome, Edge, Firefox and Safari (desktop and mobile).
- The viewer's sizing uses a newer CSS unit (`dvh`) that iPhones before iOS 15.4 (2022) don't support. On those phones the viewer would be sized less precisely. This is a very small share of visitors now, so no action is needed unless the analytics say otherwise.
- `.bmp` images display in all browsers but are very heavy. `.heic` (the iPhone photo format) and `.tif` would show as broken in most browsers. The import should convert or reject them (A2).

---

## Suggested order

| Phase | When | Items | Visual change? |
|---|---|---|---|
| 1 | Before the next 200-photo batch | P1 thumbnails, A2 stricter import, P2–P5, convert the 4 `.bmp` files | None |
| 2 | Next 2–4 weeks | B1 Back button, B2 swipe, B3 loading, B6 empty message, U1-A tag cleanup | Minimal (B6 adds a message) |
| 3 | With the team's design approval | U1-B hide empty tags, U1-C collapse on phones, U2-A "Load more" | Yes: team decides |
| 4 | When the import becomes a burden | A1 automated import | None |
| Later | At 3,000–5,000 photos or new needs | A3 database or search service | Depends |

## Open questions

1. **Who runs `cdn.txyde.com`, and what is it?** (Amazon S3 with CloudFront, or something else?) The thumbnails need to be uploaded there, and caching and compression set there.
2. **What are the actual image sizes?** Ask whoever has access to list the bucket, or run the import script from a normal internet connection. This tells us how urgent P1 is.
3. **Where is production hosted**, and who uploads `dist/` to it? Needed for P5, P6 and A1.
4. **Filters:** which U1 scenario does the team prefer? A mockup of B and C can be prepared before anything changes.
5. **Mobile grid:** is a two-column phone layout (U2-C) worth mocking up?
6. **Tag rules:** is the team willing to keep a short controlled list of tags (fixed spelling, a minimum number of photos per tag) in the spreadsheet's Options tab? This is the long-term fix for the filter overload.
