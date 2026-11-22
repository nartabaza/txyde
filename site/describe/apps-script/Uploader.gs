/**
 * TXYDE: copy archive photos from Google Drive to S3 and put the link in the sheet.
 *
 * For every Accepted row of the Main tab whose "Final file S3" cell is empty, this reads the file
 * behind "Final file link" (or "File Link") from Drive, uploads it to s3://txyde/03_Root_Final/
 * and writes its cdn.txyde.com link into "Final file S3". Each result goes to the "S3 uploads" tab.
 *
 * It never replaces a file already in the bucket: every upload is sent with "If-None-Match: *",
 * so S3 refuses it if the name is taken. A photo whose file is already there just gets its link.
 *
 * Run from the editor, in this order (see describe/README.md):
 *   previewUploads()  lists what would be uploaded, under which name. Writes nothing.
 *   uploadFirst()     uploads one photo, so you can check its link opens.
 *   startUploads()    uploads the rest, about every 10 minutes until done, then stops itself.
 *   stopUploads()     stops early.
 * A photo that failed is skipped from then on. To retry it, delete its row in the "S3 uploads" tab.
 *
 * Script properties: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (a key that may only add files to
 * 03_Root_Final/), and SHEET_ID when this script is not attached to the sheet.
 */

const MAIN_TAB = 'Main';
const MAIN_HEADER_ROW = 3;
const MAIN_FIRST_ROW = 5;
const MAIN_COLUMNS = {
  id: 'File ID',
  status: 'Status',
  finalLink: 'Final file link',
  fileLink: 'File Link',
  s3: 'Final file S3',
};

const BUCKET = 'txyde';
const REGION = 'eu-north-1';
const FOLDER = '03_Root_Final/';
const CDN = 'https://cdn.txyde.com/';
const MAX_BYTES = 50 * 1024 * 1024; // the most Apps Script can send in one request
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // a run may last 6 minutes; stop starting uploads before that
const LOG_TAB = 'S3 uploads';
const LOG_COLUMNS = ['id', 'result', 'details', 'at'];

// ---- Run these from the editor ---------------------------------------------------

function previewUploads() {
  const pending = pendingPhotos();
  console.log(pending.length + ' photos to upload. The first 15:');
  pending.slice(0, 15).forEach((p) => {
    let name;
    try {
      name = s3Name(p.id, DriveApp.getFileById(p.driveId).getName());
    } catch (err) {
      name = '(cannot open the Drive file: ' + err.message + ')';
    }
    console.log(p.id + ' → ' + FOLDER + name);
  });
}

function uploadFirst() {
  uploadPending(1);
}

function startUploads() {
  stopUploads();
  ScriptApp.newTrigger('uploadNext').timeBased().everyMinutes(10).create();
  uploadNext();
}

/** Makes every link in the "Final file S3" column clickable. Changes only how they show, not the text. */
function linkS3Column() {
  const main = book().getSheetByName(MAIN_TAB);
  const column = mainColumns(main).s3 + 1;
  const rows = main.getLastRow() - MAIN_FIRST_ROW + 1;
  if (rows < 1) return;
  const range = main.getRange(MAIN_FIRST_ROW, column, rows, 1);
  let linked = 0;
  const cells = range.getValues().map(([value]) => {
    const url = String(value).trim();
    const rich = SpreadsheetApp.newRichTextValue().setText(url);
    if (/^https?:\/\//.test(url)) { rich.setLinkUrl(url); linked += 1; }
    return [rich.build()];
  });
  range.setRichTextValues(cells);
  console.log('Linked ' + linked + ' cells.');
}

function stopUploads() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'uploadNext')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

/** Called by the trigger. */
function uploadNext() {
  const finished = uploadPending(Infinity);
  if (finished) {
    stopUploads();
    console.log('All photos are uploaded or logged as failed. Uploads stopped.');
  }
}

// ---- The work ----------------------------------------------------------------------

/** Uploads up to `limit` photos. Returns true when nothing is left to try. */
function uploadPending(limit) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Another upload run is still going.');
    return false;
  }
  try {
    const started = Date.now();
    const pending = pendingPhotos();
    const main = book().getSheetByName(MAIN_TAB);
    const s3Column = mainColumns(main).s3 + 1;
    let tried = 0;
    for (const photo of pending) {
      if (tried >= limit || Date.now() - started > TIME_BUDGET_MS) break;
      tried += 1;
      const result = uploadPhoto(photo);
      if (result.url) {
        // Write it as a link: Sheets only makes typed URLs clickable, not ones a script writes.
        main.getRange(photo.row, s3Column).setRichTextValue(
          SpreadsheetApp.newRichTextValue().setText(result.url).setLinkUrl(result.url).build());
      }
      logResult(photo.id, result.result, result.details);
      console.log(photo.id + ': ' + result.result + ', ' + result.details);
    }
    console.log('Tried ' + tried + ', ' + (pending.length - tried) + ' left.');
    return tried === pending.length;
  } finally {
    lock.releaseLock();
  }
}

function uploadPhoto(photo) {
  let file;
  try {
    file = DriveApp.getFileById(photo.driveId);
  } catch (err) {
    return { result: 'failed', details: 'cannot open the Drive file: ' + err.message };
  }
  const size = file.getSize();
  if (size > MAX_BYTES) {
    return { result: 'failed', details: 'too big for Apps Script (' + Math.round(size / 1048576) + ' MB): upload it by hand' };
  }
  const key = FOLDER + s3Name(photo.id, file.getName());
  const blob = file.getBlob();
  let response;
  try {
    response = s3Put(key, blob.getBytes(), blob.getContentType() || 'application/octet-stream');
  } catch (err) {
    return { result: 'failed', details: err.message };
  }
  const code = response.getResponseCode();
  const url = CDN + encodeKey(key, true);
  if (code === 200) return { result: 'uploaded', url, details: key };
  if (code === 412) return { result: 'already in the bucket', url, details: key };
  return { result: 'failed', details: 'S3 said ' + code + ': ' + response.getContentText().slice(0, 300) };
}

/** Accepted rows with no S3 link and a Drive link, minus the ones that already failed. */
function pendingPhotos() {
  const main = book().getSheetByName(MAIN_TAB);
  if (!main) throw new Error('No tab named "' + MAIN_TAB + '"');
  const c = mainColumns(main);
  const failed = new Set(logRows().filter((r) => r[1] === 'failed').map((r) => String(r[0])));
  const values = main.getRange(MAIN_FIRST_ROW, 1, Math.max(main.getLastRow() - MAIN_FIRST_ROW + 1, 1), main.getLastColumn()).getValues();
  const photos = [];
  values.forEach((row, i) => {
    const id = String(row[c.id]).trim();
    if (!id || String(row[c.status]).trim() !== 'Accepted' || String(row[c.s3]).trim() || failed.has(id)) return;
    const driveId = driveFileId(row[c.finalLink]) || driveFileId(row[c.fileLink]);
    if (driveId) photos.push({ id, driveId, row: MAIN_FIRST_ROW + i });
  });
  return photos;
}

/** The Drive file's own name, which already starts with "<id>_". Otherwise the id is added. */
function s3Name(id, driveName) {
  // Tidy the Drive name: no slashes, no doubled spaces, no space before the extension.
  const name = String(driveName).replace(/[\/\\]/g, '-').replace(/\s+/g, ' ').replace(/\s+(\.\w+)$/, '$1').trim();
  return name.startsWith(id + '_') ? name : id + '_' + name;
}

function driveFileId(link) {
  const m = String(link || '').match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
  return m ? m[1] || m[2] : '';
}

function mainColumns(main) {
  const header = main.getRange(MAIN_HEADER_ROW, 1, 1, main.getLastColumn()).getValues()[0]
    .map((h) => String(h).split('\n')[0].replace(/\s+/g, ' ').trim().toLowerCase());
  const cols = {};
  Object.keys(MAIN_COLUMNS).forEach((k) => {
    cols[k] = header.indexOf(MAIN_COLUMNS[k].toLowerCase());
    if (cols[k] < 0) throw new Error('Column "' + MAIN_COLUMNS[k] + '" not found in row ' + MAIN_HEADER_ROW);
  });
  return cols;
}

// ---- Log tab -----------------------------------------------------------------------

function logSheet() {
  const b = book();
  let s = b.getSheetByName(LOG_TAB);
  if (!s) {
    s = b.insertSheet(LOG_TAB);
    s.getRange(1, 1, 1, LOG_COLUMNS.length).setValues([LOG_COLUMNS]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function logRows() {
  const s = logSheet();
  return s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, LOG_COLUMNS.length).getValues();
}

function logResult(id, result, details) {
  const s = logSheet();
  s.getRange(s.getLastRow() + 1, 1, 1, LOG_COLUMNS.length).setNumberFormat('@')
    .setValues([[String(id), result, details, new Date().toISOString()]]);
}

// ---- S3 (AWS Signature Version 4) --------------------------------------------------

function s3Put(key, bytes, contentType) {
  const props = PropertiesService.getScriptProperties();
  const accessKey = props.getProperty('AWS_ACCESS_KEY_ID');
  const secret = props.getProperty('AWS_SECRET_ACCESS_KEY');
  if (!accessKey || !secret) throw new Error('Set the script properties AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');

  const host = BUCKET + '.s3.' + REGION + '.amazonaws.com';
  const amzDate = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const day = amzDate.slice(0, 8);
  const payloadHash = 'UNSIGNED-PAYLOAD'; // allowed over HTTPS; saves hashing large files here
  const path = '/' + encodeKey(key, false);
  const signedHeaders = { host, 'if-none-match': '*', 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(signedHeaders).sort();
  const canonicalRequest = [
    'PUT', path, '',
    names.map((h) => h + ':' + signedHeaders[h] + '\n').join(''),
    names.join(';'),
    payloadHash,
  ].join('\n');
  const scope = [day, REGION, 's3', 'aws4_request'].join('/');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(sha256(canonicalRequest))].join('\n');
  let signingKey = hmac(Utilities.newBlob('AWS4' + secret).getBytes(), day);
  signingKey = hmac(signingKey, REGION);
  signingKey = hmac(signingKey, 's3');
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = hex(hmac(signingKey, stringToSign));

  return UrlFetchApp.fetch('https://' + host + path, {
    method: 'put',
    payload: bytes,
    contentType,
    muteHttpExceptions: true,
    headers: {
      'If-None-Match': '*',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope +
        ', SignedHeaders=' + names.join(';') + ', Signature=' + signature,
    },
  });
}

/** Encodes each part of the key. For the CDN link, spaces become "+", as in the existing links. */
function encodeKey(key, forCdn) {
  return key.split('/').map((part) => {
    const encoded = encodeURIComponent(part).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
    return forCdn ? encoded.replace(/%20/g, '+') : encoded;
  }).join('/');
}

function hmac(keyBytes, message) {
  return Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, Utilities.newBlob(message).getBytes(), keyBytes);
}

function sha256(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
}

function hex(bytes) {
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}
