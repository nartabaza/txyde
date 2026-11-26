/**
 * TXYDE data checks: the link between the /quality/ pages and the Google Sheet.
 *
 * Keeps one "Data checks" tab, with one row per possible change to one cell of the Main tab
 * (photo ID, column, current value, proposed value) and the researcher's decision on it.
 * scripts/quality_checks.py fills it (syncChecks) and reads it back (checks). Nothing here
 * touches the Main tab: the decisions become a list of changes that are applied by hand.
 *
 * A second tab, "Data check records", holds a snapshot of each photo's record (date, place, source,
 * description...) from the same export, so the spelling page can show the records side by side.
 * Each push replaces it.
 *
 * Same project, key and web app as Code.gs, which routes the requests here.
 */

const CHECKS_SHEET = 'Data checks';
const CHECK_COLUMNS = [
  'key', 'page', 'check', 'question', 'hint', 'options', 'id', 'column', 'letter', 'op', 'match',
  'current', 'proposed', 'title', 'imageUrl', 'thumbUrl', 'context', 'addedAt',
  'decision', 'final', 'note', 'decidedAt',
];
// The part the pages write, side by side so a save is one read and one write.
const DECISION_COLUMNS = ['decision', 'final', 'note', 'decidedAt'];
// keep: leave the cell as it is. change: write `final`. reject: a reading that is not on the photo.
const DECISIONS = ['', 'change', 'keep', 'reject'];
const RECORDS_SHEET = 'Data check records';
const RECORD_COLUMNS = ['id', 'record', 'updatedAt'];

/** Every check, decided or not. The pages filter by page. */
function readChecks() {
  const values = checksSheet().getDataRange().getValues();
  const header = values.shift();
  return values.map((row) => {
    const r = {};
    header.forEach((name, i) => { r[name] = row[i] instanceof Date ? row[i].toISOString() : String(row[i]); });
    return r;
  });
}

/** Saves decisions: body.decisions = [{ key, decision, final, note }]. */
function saveChecks(body) {
  const s = checksSheet();
  const values = s.getDataRange().getValues();
  const keyCol = CHECK_COLUMNS.indexOf('key');
  const from = CHECK_COLUMNS.indexOf('decision');
  const rowOf = {};
  for (let n = 1; n < values.length; n++) rowOf[String(values[n][keyCol])] = n;
  const block = values.slice(1).map((row) => row.slice(from, from + DECISION_COLUMNS.length));
  const now = new Date().toISOString();
  const missing = [];
  (body.decisions || []).forEach((d) => {
    if (!DECISIONS.includes(d.decision)) throw new Error('Unknown decision: ' + d.decision);
    const n = rowOf[String(d.key)];
    if (!n) { missing.push(d.key); return; }
    block[n - 1] = d.decision
      ? [d.decision, String(d.final == null ? '' : d.final), String(d.note || ''), now]
      : ['', '', '', ''];
  });
  if (block.length) s.getRange(2, from + 1, block.length, DECISION_COLUMNS.length).setNumberFormat('@').setValues(block);
  return { saved: (body.decisions || []).length - missing.length, missing, decidedAt: now };
}

/**
 * Brings the tab in line with a new run of the checks: adds new ones, keeps every decided row,
 * and removes undecided rows that no longer apply (the sheet was fixed since).
 */
function syncChecks(body) {
  const s = checksSheet();
  const values = s.getDataRange().getValues();
  const keyCol = CHECK_COLUMNS.indexOf('key');
  const decisionCol = CHECK_COLUMNS.indexOf('decision');
  const incoming = {};
  (body.checks || []).forEach((c) => { incoming[String(c.key)] = c; });
  let removed = 0, kept = 0;
  for (let n = values.length - 1; n >= 1; n--) { // bottom up, so row numbers stay valid
    const k = String(values[n][keyCol]);
    if (incoming[k]) { delete incoming[k]; kept += 1; continue; }
    if (!values[n][decisionCol]) { s.deleteRow(n + 1); removed += 1; }
  }
  const now = new Date().toISOString();
  const rows = Object.values(incoming).map((c) => CHECK_COLUMNS.map((col) => {
    if (col === 'addedAt') return now;
    if (DECISION_COLUMNS.includes(col)) return '';
    return c[col] == null ? '' : String(c[col]);
  }));
  if (rows.length) {
    // Text format, so the sheet never turns an ID, a year or a reading into a number or a formula.
    s.getRange(s.getLastRow() + 1, 1, rows.length, CHECK_COLUMNS.length).setNumberFormat('@').setValues(rows);
  }
  return Object.assign({ added: rows.length, removed, kept }, body.records ? saveRecords(body.records) : {});
}

/** Replaces the records tab: records = { id: { label: value } }. */
function saveRecords(records) {
  const s = recordsSheet();
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, RECORD_COLUMNS.length).clearContent();
  const now = new Date().toISOString();
  const rows = Object.keys(records).map((id) => [id, JSON.stringify(records[id]), now]);
  if (rows.length) s.getRange(2, 1, rows.length, RECORD_COLUMNS.length).setNumberFormat('@').setValues(rows);
  return { records: rows.length };
}

/** { id: record } for the given photo IDs. */
function readRecords(ids) {
  const want = new Set(ids.map(String));
  const out = {};
  const values = recordsSheet().getDataRange().getValues();
  for (let n = 1; n < values.length; n++) {
    const id = String(values[n][0]);
    if (want.has(id)) { try { out[id] = JSON.parse(values[n][1]); } catch (err) { /* skip a broken row */ } }
  }
  return out;
}

function recordsSheet() {
  const b = book();
  let s = b.getSheetByName(RECORDS_SHEET);
  if (!s) {
    s = b.insertSheet(RECORDS_SHEET);
    s.getRange(1, 1, 1, RECORD_COLUMNS.length).setValues([RECORD_COLUMNS]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function checksSheet() {
  const b = book();
  let s = b.getSheetByName(CHECKS_SHEET);
  if (!s) {
    s = b.insertSheet(CHECKS_SHEET);
    s.getRange(1, 1, 1, CHECK_COLUMNS.length).setValues([CHECK_COLUMNS]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}
