/**
 * TXYDE description review: the link between the review page and the Google Sheet.
 *
 * Keeps one "Review" tab in the archive sheet, with one row per drafted image per batch. The review
 * page reads a batch from here and sends back each decision; scripts/push_drafts.py adds new drafts.
 * Nothing here touches the Main tab. (Uploader.gs, in the same project, fills its S3 links;
 * Checks.gs keeps the "Data checks" tab for the /quality/ pages.)
 *
 * Setup: see describe/README.md ("One-time setup"). In short: create a script project, paste this
 * file and Uploader.gs, set the script properties SHEET_ID and REVIEW_KEY, run setup() once, then
 * Deploy → New deployment → Web app (execute as: me, who has access: anyone).
 *
 * Every request must carry the review key. The page asks the reviewer for it once.
 */

const SHEET_NAME = 'Review';
const COLUMNS = [
  'batch', 'id', 'promptVersion', 'imageUrl', 'title', 'period', 'location', 'country', 'region',
  'locality', 'sublocality', 'keywords', 'notes', 'draft', 'checks', 'draftedAt',
  'status', 'final', 'reasons', 'comment', 'reviewedAt',
  'corrections', // added later: new columns go at the end, so existing tabs keep their layout
];
// Fields the review page may change. Everything else is written only when drafts are added.
const REVIEW_FIELDS = ['status', 'final', 'reasons', 'comment', 'corrections'];
const STATUSES = ['', 'approved', 'edited', 'rejected'];

// ---- Entry points ------------------------------------------------------------

function doGet(e) {
  return respond(() => {
    checkKey(e.parameter.key);
    const action = e.parameter.action || 'items';
    if (action === 'batches') return { batches: listBatches() };
    if (action === 'items') return { items: readRows().filter((r) => !e.parameter.batch || r.batch === e.parameter.batch) };
    if (action === 'checks') {
      const checks = readChecks().filter((r) => !e.parameter.page || r.page === e.parameter.page);
      return { checks, records: readRecords(checks.map((r) => r.id)) };
    }
    throw new Error('Unknown action: ' + action);
  });
}

function doPost(e) {
  return respond(() => {
    const body = JSON.parse(e.postData.contents || '{}');
    checkKey(body.key);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (body.action === 'save') return saveReview(body);
      if (body.action === 'addDrafts') return addDrafts(body);
      if (body.action === 'removeDrafts') return removeDrafts(body);
      if (body.action === 'saveChecks') return saveChecks(body);
      if (body.action === 'syncChecks') return syncChecks(body);
      throw new Error('Unknown action: ' + body.action);
    } finally {
      lock.releaseLock();
    }
  });
}

/** Run once from the editor: creates the Review and Data checks tabs with their header rows. */
function setup() {
  sheet();
  checksSheet();
  recordsSheet();
  if (!PropertiesService.getScriptProperties().getProperty('REVIEW_KEY')) {
    throw new Error('Now set the script property REVIEW_KEY (Project Settings → Script properties).');
  }
}

// ---- Actions -------------------------------------------------------------------

function listBatches() {
  const counts = {};
  readRows().forEach((r) => {
    const c = (counts[r.batch] = counts[r.batch] || { batch: r.batch, total: 0, reviewed: 0 });
    c.total += 1;
    if (r.status) c.reviewed += 1;
  });
  return Object.values(counts);
}

function saveReview(body) {
  if (!STATUSES.includes(body.status)) throw new Error('Unknown status: ' + body.status);
  const rowNumber = findRow(body.batch, body.id);
  if (!rowNumber) throw new Error('No draft for image ' + body.id + ' in batch ' + body.batch);
  const values = {
    status: body.status,
    final: String(body.final || ''),
    reasons: (body.reasons || []).join(', '),
    comment: String(body.comment || ''),
    corrections: String(body.corrections || ''),
  };
  const s = sheet();
  REVIEW_FIELDS.forEach((field) => s.getRange(rowNumber, COLUMNS.indexOf(field) + 1).setValue(values[field]));
  const reviewedAt = body.status ? new Date().toISOString() : '';
  s.getRange(rowNumber, COLUMNS.indexOf('reviewedAt') + 1).setValue(reviewedAt);
  return { saved: true, reviewedAt };
}

function addDrafts(body) {
  if (!body.batch) throw new Error('Missing batch name');
  const existing = new Set(readRows().map((r) => r.batch + '|' + r.id));
  const now = new Date().toISOString();
  const rows = (body.items || [])
    .filter((item) => !existing.has(body.batch + '|' + item.id))
    .map((item) => COLUMNS.map((col) => {
      if (col === 'batch') return body.batch;
      if (col === 'promptVersion') return body.promptVersion || '';
      if (col === 'checks') return (item.checks || []).join('\n');
      if (col === 'draftedAt') return now;
      if (REVIEW_FIELDS.includes(col) || col === 'reviewedAt') return '';
      return item[col] == null ? '' : item[col];
    }));
  if (rows.length) {
    const s = sheet();
    // Text format, so the sheet never turns a description or ID into a date or formula.
    s.getRange(s.getLastRow() + 1, 1, rows.length, COLUMNS.length).setNumberFormat('@').setValues(rows);
  }
  return { added: rows.length, skipped: (body.items || []).length - rows.length };
}

/** Removes a batch's drafts for the given IDs, but only those not reviewed yet, so no decision is lost. */
function removeDrafts(body) {
  if (!body.batch) throw new Error('Missing batch name');
  const ids = new Set((body.ids || []).map(String));
  const s = sheet();
  const values = s.getDataRange().getValues();
  const batchCol = COLUMNS.indexOf('batch'), idCol = COLUMNS.indexOf('id'), statusCol = COLUMNS.indexOf('status');
  let removed = 0, kept = 0;
  for (let i = values.length - 1; i >= 1; i--) { // bottom up, so row numbers stay valid
    const row = values[i];
    if (String(row[batchCol]) !== body.batch || !ids.has(String(row[idCol]))) continue;
    if (row[statusCol]) { kept += 1; continue; }
    s.deleteRow(i + 1);
    removed += 1;
  }
  return { removed, kept };
}

// ---- Helpers ---------------------------------------------------------------------

/** The archive sheet: the one in the SHEET_ID property, or the one this script is attached to. */
function book() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet() {
  const b = book();
  let s = b.getSheetByName(SHEET_NAME);
  if (!s) {
    s = b.insertSheet(SHEET_NAME);
    s.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight('bold');
    s.setFrozenRows(1);
  } else if (s.getLastColumn() < COLUMNS.length) {
    // A tab made before a column was added: add the missing headers at the end.
    const from = s.getLastColumn() + 1;
    s.getRange(1, from, 1, COLUMNS.length - from + 1).setValues([COLUMNS.slice(from - 1)]).setFontWeight('bold');
  }
  return s;
}

function readRows() {
  const values = sheet().getDataRange().getValues();
  const header = values.shift();
  return values.map((row) => {
    const r = {};
    header.forEach((name, i) => { r[name] = row[i] instanceof Date ? row[i].toISOString() : String(row[i]); });
    r.checks = r.checks ? r.checks.split('\n') : [];
    r.reasons = r.reasons ? r.reasons.split(', ') : [];
    return r;
  });
}

function findRow(batch, id) {
  const values = sheet().getDataRange().getValues();
  const b = COLUMNS.indexOf('batch');
  const i = COLUMNS.indexOf('id');
  for (let n = 1; n < values.length; n++) {
    if (String(values[n][b]) === String(batch) && String(values[n][i]) === String(id)) return n + 1;
  }
  return 0;
}

function checkKey(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('REVIEW_KEY');
  if (!expected || key !== expected) throw new Error('Wrong review key');
}

function respond(fn) {
  let out;
  try {
    out = Object.assign({ ok: true }, fn());
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
