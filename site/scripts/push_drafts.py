#!/usr/bin/env python3
"""Send a batch's drafts to the Review tab of the Google Sheet, or fetch reviews back.

    python scripts/push_drafts.py push NAME          add the batch's ready drafts to the Review tab
    python scripts/push_drafts.py push NAME --all    add every draft, open questions or not
    python scripts/push_drafts.py ready NAME ROUND... [--skip IDS] [--keep IDS]
                                                     gather the ready drafts of several rounds into one batch
    python scripts/push_drafts.py issues NAME ...    write the open questions to describe/issues/NAME.csv
    python scripts/push_drafts.py pull [NAME]        save the Review tab (or one batch) to describe/reviews/
    python scripts/push_drafts.py sample NAME        use a batch as the review page's demo data (no sheet needed)

A check is either a question for the researcher (it ends in "?" or "Confirm.", or it is blocking)
or a note on what the draft did ("Caption reads ...", "Draft uses the title"). A draft is ready
when its only questions are missing-info ones, which never change the draft as it stands. Only
ready drafts go to the Review tab, and their cards show the notes alone, so the researcher can
approve quickly. Every question goes to the issues file instead, grouped by type, to be answered
in bulk; photos held back for an answer are drafted again afterwards.

The Apps Script address is "review.endpoint" in src/site.json. The review key is read from the
REVIEW_KEY environment variable (keep it in the DevSecrets vault, never in a file in the repo).
Drafts already in the Review tab for that batch are skipped, so pushing twice is safe.
"""

import csv
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
ISSUES = ROOT / "describe" / "issues"
# Order of the groups in the issues file: the ones that can make a description wrong come first.
ISSUE_TYPES = ["date", "spelling", "place", "contradiction", "who-is-who", "duplicate", "missing-info", "other"]


def check_text(check):
    """A check as the review page shows it. Old drafts have plain strings, newer ones objects."""
    return check if isinstance(check, str) else check["text"]


def is_blocking(check):
    return not isinstance(check, str) and bool(check.get("blocking"))


def is_question(check):
    """A check that asks the researcher something, rather than noting what the draft did."""
    if is_blocking(check):
        return True
    text = check_text(check).rstrip()
    return "?" in text or text.endswith("Confirm.")


def holds(check):
    """A question that keeps the draft off the review page until it is answered."""
    if is_blocking(check):
        return True
    return is_question(check) and (isinstance(check, str) or check.get("type") != "missing-info")


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
        checks = draft.get("checks", [])
        items.append({**{k: v for k, v in item.items() if k != "image"},
                      "draft": draft["description"],
                      "checks": [check_text(c) for c in checks if not is_question(c)],
                      "questions": [c if isinstance(c, dict) else {"type": "other", "text": c}
                                    for c in checks if is_question(c)],
                      "held": any(holds(c) for c in checks)})
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


def push(name, everything=False):
    items, version = merged(name)
    held = [i for i in items if i["held"]]
    if not everything:
        items = [i for i in items if not i["held"]]
        if held:
            print(f"  {len(held)} drafts with open questions held back (see: push_drafts.py issues {name})")
    items = [{k: v for k, v in i.items() if k not in ("questions", "held", "round")} for i in items]
    no_image = [str(i["id"]) for i in items if not i.get("imageUrl")]
    if no_image:
        print(f"  warning: no public image for {', '.join(no_image)}; the review page will show no photo for these")
    body = {"key": key(), "action": "addDrafts", "batch": name,
            "promptVersion": version, "items": items}
    request = urllib.request.Request(endpoint(), data=json.dumps(body).encode("utf-8"), method="POST")
    result = call(request)
    print(f"Added {result['added']} drafts to the Review tab (skipped {result['skipped']} already there).")


def ready(name, rounds, skip=(), keep=()):
    """Gather the ready drafts of several rounds into one batch, for a review session with no
    open questions. IDs in skip are left out; IDs in keep go in even with questions (drafts
    already reviewed under their round)."""
    items, drafts, version = [], [], ""
    for r in rounds:
        batch = json.loads((BATCHES / r / "batch.json").read_text(encoding="utf-8"))
        source = json.loads((BATCHES / r / "drafts.json").read_text(encoding="utf-8"))
        version = version or source.get("promptVersion", "")
        by_id = {i["id"]: i for i in batch["items"]}
        for d in source["drafts"]:
            checks = d.get("checks", [])
            if d["id"] in skip or (any(holds(c) for c in checks) and d["id"] not in keep):
                continue
            items.append({**by_id[d["id"]], "round": r})
            # The questions stay in the round's drafts.json and reach the issues file from there.
            drafts.append({**d, "checks": [c for c in checks if not is_question(c)], "round": r})
    folder = BATCHES / name
    folder.mkdir(parents=True, exist_ok=True)
    for file, data in (("batch.json", {"batch": name, "rounds": list(rounds), "items": items}),
                       ("drafts.json", {"promptVersion": version, "drafts": drafts})):
        (folder / file).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(drafts)} ready drafts to {folder}")


def issues(names):
    """One row per open question, grouped by type, for the researcher to answer in a sheet.
    "waiting" says whether the photo is held off the review page until the answer comes."""
    rows = []
    for name in names:
        items, _ = merged(name)
        for item in items:
            for check in item["questions"]:
                kind = check.get("type", "other")
                rows.append({"type": kind if kind in ISSUE_TYPES else "other", "id": item["id"],
                             "title": item.get("title", ""), "question": check["text"], "answer": "",
                             "waiting": "yes" if item["held"] else "no",
                             "batch": name, "image": item.get("imageUrl", "")})
    rows.sort(key=lambda r: (ISSUE_TYPES.index(r["type"]), int(r["id"])))
    ISSUES.mkdir(parents=True, exist_ok=True)
    out = ISSUES / f"{'+'.join(names)}.csv"
    with out.open("w", encoding="utf-8-sig", newline="") as f:  # BOM: Excel and Sheets read the Arabic right
        writer = csv.DictWriter(f, fieldnames=["type", "id", "title", "question", "answer", "waiting", "batch", "image"])
        writer.writeheader()
        writer.writerows(rows)
    counts = {}
    for r in rows:
        counts[r["type"]] = counts.get(r["type"], 0) + 1
    photos = len({(r["batch"], r["id"]) for r in rows})
    print(f"Wrote {len(rows)} questions about {photos} photos to {out}")
    for kind in ISSUE_TYPES:
        if kind in counts:
            print(f"  {kind}: {counts[kind]}")


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
    elif command == "push" and args:
        push(args[0], everything="--all" in args)
    elif command == "ready" and len(args) > 1:
        def ids(flag):
            return {int(v) for v in args[args.index(flag) + 1].split(",")} if flag in args else set()
        names = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))]
        ready(names[0], names[1:], ids("--skip"), ids("--keep"))
    elif command == "issues" and args:
        issues(args)
    elif command == "sample" and args:
        sample(args[0])
    else:
        sys.exit(__doc__)
