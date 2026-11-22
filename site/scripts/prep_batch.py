#!/usr/bin/env python3
"""Prepare a batch of photos for Claude to draft descriptions for.

    python scripts/prep_batch.py NAME --next 20            the next 20 photos whose description needs review
    python scripts/prep_batch.py NAME --ids 21 22 24       these photos
    python scripts/prep_batch.py examples --ids 7 13 …     rewrite describe/examples.json from approved photos

Reads the newest data/PhotoArchive_Master_Sheet*.xlsx (or --sheet). A photo "needs review" when
it is Accepted and its "Description ready" column (CV) is not TRUE. --next skips photos already in
another batch folder.

Writes describe/batches/NAME/batch.json (what Claude may use for each photo, see draft_input) and
describe/batches/NAME/images/<id>.jpg (a copy of each image for Claude to look at). Claude then
writes describe/batches/NAME/drafts.json (see describe/prompt.md), and scripts/push_drafts.py sends
the drafts to the Review tab of the Google Sheet.

Images come from S3 when the photo has a "Final file S3" link, else from the Google Drive
"Final file link", which only works once the file is shared as "anyone with the link".
Photos whose image cannot be fetched are left out (listed at the end) unless --allow-missing-images.

Needs openpyxl and Pillow.
"""

import argparse
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from master_sheet import latest_master, read_master  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DESCRIBE = ROOT / "describe"
BATCHES = DESCRIBE / "batches"
IMAGE_COPIES = ROOT / "src" / "images.json"
MAX_SIDE = 1600

# What the drafting may see, in this order. Never the current description (the thing being
# drafted), links, or review flags.
INPUT_FIELDS = [
    "title", "period", "dateTaken", "dateType", "location", "country", "region", "locality",
    "sublocality", "photographer", "names", "originalNames", "dignitaries", "dignitaryBorn",
    "dignitaryDied", "tribe", "artType", "creator", "artDate", "artOwner", "museum", "book",
    "collection", "inscription", "inscriptionLanguage", "keywords", "notes",
]


def draft_input(photo):
    """The photo's fields that the drafting may use, leaving out empty ones."""
    item = {"id": photo["id"]}
    for key in INPUT_FIELDS:
        value = photo.get(key)
        if value:
            item[key] = value.strip(", ") if key == "keywords" else value
    if photo.get("context"):
        item["context"] = photo["context"]
    return item


def image_sources(photo, copies):
    """(url to download, url the review page shows) candidates, best first."""
    sources = []
    if photo["s3"]:
        original = photo["s3"].replace(" ", "+")
        url = copies.get(original, {}).get("large") or original
        sources.append((url, url))
    match = re.search(r"/d/([\w-]+)", photo["finalLink"] or photo["fileLink"] or "")
    if match:
        # Works only for files shared as "anyone with the link".
        url = f"https://drive.google.com/thumbnail?id={match.group(1)}&sz=w{MAX_SIDE}"
        sources.append((url, url))
    return sources


def download_jpeg(url, dest):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (txyde-prep-batch)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if not response.headers.get("Content-Type", "").startswith("image/"):
            raise ValueError("not an image (is the file shared?)")
        image = Image.open(io.BytesIO(response.read()))
    save_jpeg(image, dest)


def save_jpeg(image, dest):
    image = image.convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    image.save(dest, "JPEG", quality=88)


def already_batched():
    ids = set()
    for file in BATCHES.glob("*/batch.json"):
        if file.parent.name.startswith("test-"):
            continue
        ids.update(item["id"] for item in json.loads(file.read_text(encoding="utf-8"))["items"])
    return ids


def write_examples(photos, ids):
    examples = []
    for photo_id in ids:
        photo = photos.get(photo_id)
        if not photo or not photo["ready"]:
            print(f"  {photo_id}: not a photo with a ready description, left out")
            continue
        examples.append({"input": draft_input(photo), "description": photo["description"]})
    out = DESCRIBE / "examples.json"
    note = ("Approved descriptions (column CN) with the input the drafting gets for each photo. "
            "Made by scripts/prep_batch.py examples; edit a description here to correct it.")
    out.write_text(json.dumps({"note": note, "examples": examples}, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    print(f"Wrote {len(examples)} examples to {out}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("name", help='batch folder name, e.g. round-1 (or "examples")')
    pick = parser.add_mutually_exclusive_group(required=True)
    pick.add_argument("--ids", type=int, nargs="+")
    pick.add_argument("--next", type=int, metavar="N")
    parser.add_argument("--sheet", type=Path)
    parser.add_argument("--allow-missing-images", action="store_true")
    parser.add_argument("--images-from", type=Path, metavar="DIR",
                        help='use image files already downloaded to DIR, named "<id>_…" as the sheet names them')
    args = parser.parse_args()

    sheet = args.sheet or latest_master()
    photos = {p["id"]: p for p in read_master(sheet)}
    print(f"Read {len(photos)} photos from {sheet.name}")

    if args.name == "examples":
        return write_examples(photos, args.ids or [])

    if args.ids:
        chosen = [photos[i] for i in args.ids if i in photos]
        missing = [i for i in args.ids if i not in photos]
    else:
        done = already_batched()
        chosen = [p for p in photos.values()
                  if p["status"] == "Accepted" and not p["ready"] and p["id"] not in done]
        chosen.sort(key=lambda p: p["id"])
        missing = []

    copies = json.loads(IMAGE_COPIES.read_text(encoding="utf-8")) if IMAGE_COPIES.exists() else {}
    folder = BATCHES / args.name
    (folder / "images").mkdir(parents=True, exist_ok=True)

    items, problems = [], [f"{i}: not in the sheet" for i in missing]
    for photo in chosen:
        if args.next and len(items) >= args.next:
            break
        dest = folder / "images" / f"{photo['id']}.jpg"
        shown = ""
        errors = []
        local = sorted(args.images_from.glob(f"{photo['id']}_*")) if args.images_from else []
        if local:
            try:
                if not dest.exists():
                    save_jpeg(Image.open(local[0]), dest)
                shown = "local"  # no public address yet; push_drafts.py sample serves the local copy
            except Exception as err:  # unreadable or unfinished file
                errors.append(f"{local[0].name}: {err}")
        for url, page_url in ([] if shown else image_sources(photo, copies)):
            try:
                if not dest.exists():
                    download_jpeg(url, dest)
                shown = page_url
                break
            except Exception as err:  # network error, private Drive file, unreadable image
                errors.append(f"{url.split('?')[0]}: {err}")
        if not shown and not args.allow_missing_images:
            problems.append(f"{photo['id']}: no image ({'; '.join(errors) or 'no link'})")
            continue
        item = draft_input(photo)
        item.update(image=f"images/{photo['id']}.jpg" if shown else None,
                    imageUrl="" if shown == "local" else shown)
        items.append(item)

    (folder / "batch.json").write_text(
        json.dumps({"batch": args.name, "sheet": sheet.name, "items": items}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    print(f"{len(items)} photos ready in {folder}")
    if problems:
        print(f"{len(problems)} left out:")
        for problem in problems[:15]:
            print("  ", problem)
        if len(problems) > 15:
            print(f"   … and {len(problems) - 15} more")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
