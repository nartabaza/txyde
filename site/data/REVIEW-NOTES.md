# Photo import: review notes

Initial build from `Photo_Archive_Final_Output_Website.xlsx`, imported on 2026-10-12. It's meant for exploring the data and showing the team, so nothing here is final. Fill in the **Team feedback** lines during the review.

To re-import after the sheet changes, download it again as .xlsx into `site/data/`, then run:

```bash
python scripts/import_sheet.py   # rewrites src/categories/homeland.json and diaspora.json
npm run build
```

The script prints every skipped or suspicious row, so this file only needs updating when a decision changes.

## Result

| | Photos |
|---|---|
| Rows in Main | 109 |
| Homeland page | 66 |
| Diaspora page | 36 |
| Skipped | 7 |

## Decisions made

1. **Two pages split by the Location column.** Homeland goes to `/homeland/` (new page) and Diaspora to `/diaspora/`. Homeland was added to the menu, and the home page cards now link to both pages.
2. **All rows in Main are treated as approved.** Main has no status column.
3. **The Stories tab is ignored for now.** Most of its photo IDs aren't in Main yet.
4. **Repeated photos are kept as separate tiles**, even when they share a title and description (see Duplicates below).
5. **Unknown values ("nAn") are hidden.** The viewer shows "Unknown". Photos without a country only appear under **Show All**, not under any place button.
6. **Country codes are shown as full names**, using the Options tab (KBR becomes Kabardino-Balkaria).
7. **The viewer shows Country, Region, Locality and Sub-locality as separate lines** (team request, 2026-10). Until the sheet is re-imported, the JSON only has the old merged place name, which is shown as Locality.
8. **Keywords become tag filters.** Trailing commas and repeats are removed, and spelling and capitalisation are kept as written.
9. **Photos are ordered by File ID.**
10. **Rows whose image doesn't load are left out**, so the demo has no broken tiles.
11. **The spreadsheet isn't published or committed.** It lives in `site/data/` (outside `assets/`) and is git-ignored because the Contacts tab holds personal details.

Team feedback:

## Problem files

| ID | Problem | What's needed |
|---|---|---|
| 49, 50, 51 | Image link points to the old `03_Root_Final/F_KBR/19th/` folder and returns an error. The file isn't at the flat-folder path either. **Left out.** | Find where the files are now and fix column M |
| 54, 56, 122, 145 | No Location, so they can't go on Homeland or Diaspora. **Left out.** | Fill in Location |
| 29 | Image link contains a raw space (`Mythical creatures.jpg`). The import fixes it automatically. | Fix in sheet (optional) |
| 7, 194, 195, 196 | Images are .bmp: very large files and slow to load | Convert to .jpg or .webp and re-upload |
| 142 | No description | Write one |
| 182 | Period is 19th, but the description says 1914 | Check which is right |

Images on the old live Diaspora page all used the old `F_<country>/<period>/` folders and now return errors. This import replaces them with working links.

Team feedback:

## Duplicates (same title)

Same title and same description:

- 57, 60, 61, 62: Pachev Bekmurza
- 90, 91: Third Cavalry
- 106, 127: Bedouins and Circassian chiefs
- 180, 181: Pegasus Rhyton
- 201, 202: Al Khushnyieh, a town in Golan
- 204, 205: Qunaitra

Same title, different description (probably fine, just distinct photos of one subject):

- 7, 66: The Adyghe School in Syria
- 10, 194, 195, 196, 197: Damascus dancing troupe
- 19, 45 (Homeland) and 26 (Diaspora): Azheghafe
- 67, 68: Shawaj Yelmirza
- 71, 72, 73, 75, 77, 78: Dautoqua Zaurbek (Serebriakov)
- 88 (Homeland) and 109 (Diaspora): Traditional male costume
- 112, 142: Dolmen in Shhafit
- 170, 171: Syrian president Ahmad Nami

Open question: should a repeated subject be **one tile that opens several images**, or stay as separate tiles? Titles could also be made distinct (e.g. "Third Cavalry, 1" and "Third Cavalry, 2").

Team feedback:

## Data gaps and consistency

- **No country (12 photos):** 13, 14, 35, 37, 39, 90, 91, 93, 94, 95, 97, 148. These can only be found under Show All.
- **No period (11 photos):** 13, 14, 141, 142, 148, 154, 155, 157, 158, 187, 188.
- **No keywords: 65 of 102 photos.** The tag filters only cover about a third of the archive.
- **Tag spelling and capitalisation differ**, which creates separate filter buttons: "students" vs "Students", "teacher" vs "Teacher", "Ajeghafe" vs "Azheghafe" (the title spelling), "Advertizing", "Ancamble", "Bolshoviks". Some tags are in Cyrillic (Уэрэдыж, Орэдыж).
- **"Russia" appears on the Diaspora page** (16, 26). Per the sheet's rule, a painting or object takes the location of the hard copy (e.g. a museum in Saint Petersburg). Is that what we want visitors to see?
- **Mixed country levels:** "Russia" sits next to its republics (Adygea, Kabardino-Balkaria, Karachay-Cherkess Republic) as equal place buttons.
- **Periods include "4000 B.C" and "500 B.C"**, shown as written.

Team feedback:

## Not done yet

- Home page tag chips (Village life, Costume, ...) still link nowhere.
- No thumbnails: the grid loads the full-size images, which is slow for the .bmp files and large photos.
- Stories tab not used.
- The homeland/diaspora pages are regenerated by the import, so manual edits to those JSON files will be overwritten.
