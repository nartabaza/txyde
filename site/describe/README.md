# Drafting and reviewing photo descriptions

Claude drafts the descriptions, the researcher reviews them on `/review/`, and each round of
reviews improves the style guide for the next round. No paid API is used: the drafting runs in a
Claude Code session on the subscription.

| File | What it is |
|---|---|
| `style-guide.md` | The house style, drawn from the approved descriptions. Versioned. |
| `prompt.md` | The drafting instructions Claude follows for each batch. Versioned with the guide. |
| `examples.json` | Approved descriptions used as style examples. Grows as reviews come in. |
| `apps-script/Code.gs` | Links the review page to a "Review" tab in the archive Google Sheet. |
| `batches/NAME/` | One folder per batch: `batch.json` (metadata), `images/` (local copies, not committed), `drafts.json` |
| `reviews/` | Reviews fetched back from the sheet |
| `tests/` | Blind tests of the prompt against approved descriptions |

## One round

1. **Prepare the batch:** put the latest master sheet export (`PhotoArchive_Master_Sheet*.xlsx`) in
   `data/`, then `python scripts/prep_batch.py round-2 --next 50`. That takes the next 50 Accepted
   photos whose "Description ready" (column CV) is not TRUE, skipping photos already in a batch.
   Images come from S3 once the uploader has run (see setup, step 3). Until then, download them
   in a browser that is signed in to Drive and add `--images-from ~/Downloads` (files named
   `<id>_…` as Drive names them).
2. **Draft:** in Claude Code, say *"Draft the descriptions for batch round-1, following
   describe/prompt.md."* This writes `batches/round-1/drafts.json`.
3. **Send to the sheet:** `python scripts/push_drafts.py push round-1`. Only ready drafts go:
   ones whose only questions are missing-info. Their cards show just the notes.
   `python scripts/push_drafts.py issues round-1` writes every question to `issues/`, for the
   researcher to answer in bulk (column `waiting`: the photo is held back until answered).
   `ready NAME ROUND...` gathers the ready drafts of several rounds into one review batch.
4. **Review:** the researcher opens `/review/` on the preview site and works through the batch.
5. **Learn:** `python scripts/push_drafts.py pull round-1`, then ask Claude to compare the drafts
   with the researcher's versions and update `style-guide.md`, `prompt.md` and `examples.json`
   (bump the version).
6. **Fix the facts:** the researcher answers the checks in the "Corrections for the archive sheet"
   field, in plain words (the `corrections` column of the Review tab). Ask Claude to turn the
   pulled corrections into a list of exact changes (ID, column, old value, new value). Check the
   list, then apply it to the Main tab. Claude never writes to the master sheet itself.
7. **Publish:** copy approved descriptions into the Description column of the Main tab, then run
   the usual `import_sheet.py`.

## One-time setup

One Apps Script project does two jobs: `Uploader.gs` copies the photos from Drive to S3 and fills
the "Final file S3" column, and `Code.gs` links the review page to the sheet.

**Make the project in your own Google account**, not inside the sheet. A script attached to the
sheet would show its keys to everyone who can edit the sheet. Your account only needs edit access
to the sheet and view access to the Drive folders; the script runs as you.

### 1. AWS key (the bucket owner does this once)

The key the site's deploys use may only write `thumbs/` and `large/`. The uploader needs its own
IAM user (for example `txyde-sheet-uploader`) with this policy, and an access key for it. It can
add new originals to `03_Root_Final/` but never replace one, read anything, or delete:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "AddOriginals", "Effect": "Allow", "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::txyde/03_Root_Final/*" },
    { "Sid": "NeverReplaceOriginals", "Effect": "Deny", "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::txyde/03_Root_Final/*",
      "Condition": { "Null": { "s3:if-none-match": "true" } } }
  ]
}
```

### 2. The script project

1. Go to script.google.com → New project. Name it "TXYDE sheet". Add two script files and paste
   `apps-script/Code.gs` and `apps-script/Uploader.gs` into them. Save.
2. Project Settings → Script properties. Add:
   - `SHEET_ID`: the long ID in the sheet's address (`docs.google.com/spreadsheets/d/<SHEET_ID>/edit`).
   - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: the uploader key from step 1.
   - `REVIEW_KEY`: a long random value. Give it to the researcher.

   Keep copies in the DevSecrets vault (`Save-DevSecret NAME`), never in this repo.

### 3. Upload the photos to S3

Run these from the editor (choose the function at the top, then Run). Google asks for permission
the first time.

1. `previewUploads`: lists how many photos would be uploaded and the names they would get. It
   writes nothing. The names should look like the existing ones (`215_SYR_20th_Title.jpg`).
2. `uploadFirst`: uploads one photo. Open the link it wrote in the "Final file S3" column and
   check the photo loads.
3. `startUploads`: uploads the rest. A run lasts about 5 minutes and repeats every 10 minutes
   until every photo is done, then stops itself. `stopUploads` stops it early. Keep the editor
   tab open until the first run finishes: reloading or closing it cancels that run (the log says
   "Execution cancelled"). Nothing is lost, and the later runs come from the trigger, so they go
   on with the tab closed.

Every result goes to the "S3 uploads" tab. A photo that failed (most often a file over 50 MB, or
a Drive link the account cannot open) is skipped from then on: fix it, delete its row in that
tab, and it is tried again. Google allows a personal account about 90 minutes of timed runs a
day, so about 750 photos may take more than a day.

After a new photo is added to the sheet, run `uploadFirst` or `startUploads` again.

### 4. The review page

1. In the editor, run `setup` once. It creates the Review tab.
2. Deploy → New deployment → Web app. Execute as: **Me**. Who has access: **Anyone**. Copy the URL.
3. Put the URL in `src/site.json` → `"review": { "endpoint": "…" }` and push. The review page now
   uses the sheet instead of the demo data, and asks the researcher for the key once.

Download a fresh copy of the sheet into `data/` before preparing a batch, so `prep_batch.py`
sees the new S3 links and the review page shows those images.

Until the endpoint is set, `/review/` runs in **demo mode** on `assets/review/sample.json`
(made with `python scripts/push_drafts.py sample NAME`), and decisions stay in that browser.

The key stops strangers from writing to the sheet. The endpoint URL is public in the page, but it
does nothing without the key. If the key leaks, change the script property and tell the researcher.
