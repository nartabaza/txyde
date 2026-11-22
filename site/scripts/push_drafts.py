#!/usr/bin/env python3
"""Send a batch's drafts to the Review tab of the Google Sheet, or fetch reviews back.

    python scripts/push_drafts.py push NAME      add describe/batches/NAME/drafts.json to the Review tab
    python scripts/push_drafts.py pull [NAME]    save the Review tab (or one batch) to describe/reviews/
    python scripts/push_drafts.py sample NAME    use a batch as the review page's demo data (no sheet needed)

The Apps Script address is "review.endpoint" in src/site.json. The review key is read from the
REVIEW_KEY environment variable (keep it in the DevSecrets vault, never in a file in the repo).
Drafts already in the Review tab for that batch are skipped, so pushing twice is safe.
"""

import json
import os
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BATCHES = ROOT / "describe" / "batches"
REVIEWS = ROOT / "describe" / "reviews"


def endpoint():
    url = json.loads((ROOT / "src" / "site.json").read_text(encoding="utf-8")).get("review", {}).get("endpoint")
    if not url:
        sys.exit('Set "review": {"endpoint": "<Apps Script web app URL>"} in src/site.json first.')
    return url


def key():
    value = os.environ.get("REVIEW_KEY")
    if not value:
        sys.exit("Set the REVIEW_KEY environment variable (from the DevSecrets vault).")
    return value


def call(request):
    with urllib.request.urlopen(request, timeout=120) as response:  # follows Apps Script's redirect
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        sys.exit(f"Apps Script error: {result.get('error')}")
    return result


def merged(name):
    """The batch's items with their drafts, in the shape the Review tab stores them."""
    folder = BATCHES / name
    batch = json.loads((folder / "batch.json").read_text(encoding="utf-8"))
    drafts = json.loads((folder / "drafts.json").read_text(encoding="utf-8"))
    by_id = {d["id"]: d for d in drafts["drafts"]}
    items = []
    for item in batch["items"]:
        draft = by_id.get(item["id"])
        if not draft:
            print(f"  no draft for {item['id']}, left out")
            continue
        items.append({**{k: v for k, v in item.items() if k != "image"},
                      "draft": draft["description"], "checks": draft.get("checks", [])})
    return items, drafts.get("promptVersion", "")


def sample(name):
    items, version = merged(name)
    out = ROOT / "assets" / "review" / "sample.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    # Images with no public address yet (downloaded by hand) are served from the site itself.
    # assets/review/images/ is not committed.
    images = out.parent / "images"
    images.mkdir(exist_ok=True)
    for item in items:
        if not item.get("imageUrl") and (BATCHES / name / "images" / f"{item['id']}.jpg").exists():
            shutil.copyfile(BATCHES / name / "images" / f"{item['id']}.jpg", images / f"{name}-{item['id']}.jpg")
            item["imageUrl"] = f"/assets/review/images/{name}-{item['id']}.jpg"
    rows = [{**item, "batch": name, "promptVersion": version} for item in items]
    out.write_text(json.dumps({"items": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} sample drafts to {out}")


def push(name):
    items, version = merged(name)
    no_image = [str(i["id"]) for i in items if not i.get("imageUrl")]
    if no_image:
        print(f"  warning: no public image for {', '.join(no_image)}; the review page will show no photo for these")
    body = {"key": key(), "action": "addDrafts", "batch": name,
            "promptVersion": version, "items": items}
    request = urllib.request.Request(endpoint(), data=json.dumps(body).encode("utf-8"), method="POST")
    result = call(request)
    print(f"Added {result['added']} drafts to the Review tab (skipped {result['skipped']} already there).")


def pull(name=None):
    query = {"key": key(), "action": "items"}
    if name:
        query["batch"] = name
    result = call(urllib.request.Request(endpoint() + "?" + urllib.parse.urlencode(query)))
    REVIEWS.mkdir(parents=True, exist_ok=True)
    out = REVIEWS / f"{name or 'all'}.json"
    out.write_text(json.dumps(result["items"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    done = sum(1 for r in result["items"] if r.get("status"))
    print(f"Saved {len(result['items'])} rows ({done} reviewed) to {out}")


if __name__ == "__main__":
    command, args = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ("", [])
    if command == "pull":
        pull(args[0] if args else None)
    elif command in ("push", "sample") and args:
        (push if command == "push" else sample)(args[0])
    else:
        sys.exit(__doc__)
