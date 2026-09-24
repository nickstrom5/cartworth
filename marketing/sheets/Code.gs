/**
 * Cartworth price tracker — Google Sheets importer.
 *
 * Paste this whole file into the Sheet's Apps Script editor (Extensions > Apps Script), then run
 * `setup` once. See marketing/sheets/SETUP.md for the exact clicks.
 *
 * What it does, every hour, by itself:
 *   1. looks in My Drive/Cartworth/price-tracker/incoming/ for the CSVs the tracker on the Mac
 *      writes (prices_YYYY-MM-DD_r<run>_n<rows>.csv and summary_…csv);
 *   2. checks each file is whole (header exactly as expected, row count as the name says — a file
 *      Drive has only half-synced is left for the next hour);
 *   3. appends its rows to the `prices` or `daily_summary` tab, skipping any row whose key is
 *      already there — so running it twice, or importing the same file twice, adds nothing;
 *   4. moves the file to imported/ so it is never read again.
 *
 * `prices` holds one calendar month at a time. A spreadsheet is capped at 10 million cells and
 * gets slow long before that; a year of curated rows is up to ~30 million cells, a month at most
 * ~2.6 million. When the first row of a new month arrives the whole spreadsheet is copied to
 * "Cartworth prices <YYYY-MM> (archive)" in Cartworth/price-tracker/archive/ and `prices` starts
 * empty. daily_summary is small (~0.7 million cells a year) and stays. If a month ever outgrows
 * CW_CELL_LIMIT (more ZIPs, more terms), it rolls over early into a "-part" archive.
 *
 * The block marked PURE below has no Google services in it, so test/qa-tracker-sheets.test.js can
 * run this very file under Node and test the CSV parser, the dedupe, the file-name check and the
 * tab routing. Everything below the GOOGLE SERVICES line cannot run outside Google and is untested
 * by the repo's suite.
 */

// ============================================================================ PURE (tested in Node)

var CW_POST_RULE = 'Every number is a snapshot — re-check it live the same day before posting.';
var CW_FOLDER = ['Cartworth', 'price-tracker'];
var CW_CELL_LIMIT = 9000000; // Google's cap is 10,000,000 cells per spreadsheet; roll over well before it.
var CW_TRIGGER_HANDLER = 'importNew';

/** The tabs this script owns, their columns in order. scripts/tracker/columns.js must match exactly. */
var CW_COLUMNS = {
  prices: [
    'key', 'date', 'captured_at', 'zip', 'term', 'store', 'store_id', 'store_location_id', 'basis',
    'product', 'brand', 'size_listed', 'price', 'price_per', 'regular_price', 'on_sale', 'promo',
    'card_price', 'card_label', 'unit_price', 'unit', 'unit_price_est', 'relevance', 'product_id',
    'parser_version', 'url', 'run_id'
  ],
  daily_summary: [
    'key', 'date', 'run_id', 'zip', 'store', 'store_id', 'basis', 'store_location_id', 'store_address',
    'distance_mi', 'price_note', 'terms_tracked', 'terms_ok', 'terms_empty', 'terms_failed',
    'rows_kept', 'rows_flagged', 'curated_rows', 'weekly_ad_rows', 'note', 'parser_version'
  ]
};

var CW_NUMBER = ['price', 'regular_price', 'card_price', 'unit_price', 'relevance', 'distance_mi',
  'terms_tracked', 'terms_ok', 'terms_empty', 'terms_failed', 'rows_kept', 'rows_flagged', 'curated_rows', 'weekly_ad_rows'];
var CW_BOOL = ['on_sale', 'unit_price_est'];

/** What each column means. Shown on the README tab. */
var CW_DOCS = [
  ['key', 'Dedupe key: date|zip|term|store_id (prices) or date|zip|store_id|run_id (daily_summary). One row per key, ever.'],
  ['date', 'Local date of the capture run (America/Chicago).'],
  ['captured_at', 'UTC time the store answered. GROUND TRUTH.'],
  ['zip', 'The ZIP the stores were looked up from (60618 Chicago, 60148 Lombard, 53211 Milwaukee, 53142 Kenosha).'],
  ['term', 'What was searched, exactly as in scripts/tracker/terms.txt.'],
  ['store / store_id', 'The chain, as Cartworth names it.'],
  ['store_location_id', 'The retailer\'s own id for the store location the price came from. Follow a SKU only within one location.'],
  ['basis', 'HOW the price was read — see the table below. Never compare two rows with different bases.'],
  ['product / brand', 'As the retailer listed it. GROUND TRUTH.'],
  ['size_listed', 'The package size exactly as the retailer wrote it ("16 oz", "4 ea", "1 lb"). GROUND TRUTH.'],
  ['price', 'The listed price anyone pays (no card, no membership). Per package, or per pound when price_per = lb. GROUND TRUTH.'],
  ['price_per', '"package" or "lb".'],
  ['regular_price', 'The non-sale price when the retailer showed one. GROUND TRUTH.'],
  ['on_sale', 'TRUE when the retailer marked it on sale. GROUND TRUTH.'],
  ['promo', 'Promotion text as listed ("Buy 1, get 1 free"). GROUND TRUTH.'],
  ['card_price / card_label', 'A loyalty-card or member price and the retailer\'s label for it, when lower. Not used in unit_price.'],
  ['unit_price / unit', 'DERIVED: price divided by the parsed size, in the unit shown (per lb, per gal, per dozen...). Depends on parser_version.'],
  ['unit_price_est', 'DERIVED: TRUE when the unit price rests on a typical piece weight, not a stated size.'],
  ['relevance', 'DERIVED: 0-1, how well the product matches the term. This row is the store\'s best comparable match (>= 0.55), not flagged as implausible, sizes consistent.'],
  ['product_id', 'The retailer\'s stable product id. Same id + same store_location_id + same basis = the same SKU on the same shelf, day to day.'],
  ['parser_version', 'Fingerprint of the Cartworth parsing code that produced the DERIVED columns. A change in unit_price across two parser versions may be a parser change, not a price change.'],
  ['url', 'The product page, for re-checking the price live before posting.'],
  ['run_id', 'The capture run (local time, YYYYMMDDTHHMMSS).'],
  ['daily_summary', 'One row per store per ZIP per run: how many terms were priced, failed or empty, rows kept and flagged, the store\'s address and price note. store_id "_directory" rows describe the ZIP; "_run" rows the whole run (duration, requests, the smallest gap left between two requests to one site, any site that said "too many requests").']
];

var CW_BASES = [
  ['shelf', 'The in-store shelf price at the store nearest the ZIP (ALDI, Woodman\'s, Whole Foods, Trader Joe\'s, and Instacart stores whose listing says in-store / no markup).'],
  ['online-instacart', 'The store\'s own Instacart listing. It runs AT OR ABOVE the shelf price and is not the store\'s app or shelf: Jewel\'s Instacart listing can be $4.99 where the Jewel app shows $4.49.'],
  ['national', 'A chain-wide Instacart listing (Walmart) that is not tied to any store near the ZIP. No address, no distance.'],
  ['weekly-ad', 'The weekly circular. Kept in the daily CSV archive only, never in `prices`: an ad has dates and conditions (card, coupon, multi-buy).']
];

/** RFC 4180 CSV -> array of rows (arrays of strings). Quoted fields may hold commas, "" quotes and line breaks. */
function CW_parseCsv(text) {
  var s = String(text == null ? '' : text);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  var rows = [];
  var row = [];
  var field = '';
  var i = 0;
  var quoted = false;
  var touched = false; // this row has content (so a bare line break is not a row)
  while (i < s.length) {
    var c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; touched = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; touched = true; i += 1; continue; }
    if (c === '\r' || c === '\n') {
      if (touched || field !== '') { row.push(field); rows.push(row); }
      row = []; field = ''; touched = false;
      i += (c === '\r' && s[i + 1] === '\n') ? 2 : 1;
      continue;
    }
    field += c; touched = true; i += 1;
  }
  if (quoted) throw new Error('CSV ends inside a quoted field (file cut short?)');
  if (touched || field !== '') { row.push(field); rows.push(row); }
  return rows;
}

/** prices_2026-09-24_r20260924T063002_n1834.csv -> { tab, date, runId, rows }; anything else -> null. */
function CW_classifyFile(name) {
  var m = /^(prices|summary)_(\d{4}-\d{2}-\d{2})_r(\d{8}T\d{6})_n(\d+)\.csv$/.exec(String(name));
  if (!m) return null;
  return { tab: m[1] === 'prices' ? 'prices' : 'daily_summary', date: m[2], runId: m[3], rows: Number(m[4]) };
}

/** Is this parsed file complete and in the shape the tab expects? */
function CW_validate(info, table) {
  var want = CW_COLUMNS[info.tab];
  if (!table.length) return { ok: false, error: 'empty file' };
  var header = table[0];
  if (header.join(',') !== want.join(',')) return { ok: false, error: 'header does not match the ' + info.tab + ' columns (tracker and script out of step?)' };
  var data = table.length - 1;
  if (data !== info.rows) return { ok: false, error: 'file has ' + data + ' rows, its name says ' + info.rows + ' (still syncing?)' };
  for (var i = 1; i < table.length; i++) {
    if (table[i].length !== want.length) return { ok: false, error: 'row ' + i + ' has ' + table[i].length + ' fields, expected ' + want.length };
  }
  return { ok: true, error: null };
}

/** '2026-09-24' -> '2026-09': the period one `prices` tab holds. */
function CW_periodOf(date) {
  var m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(date));
  return m ? m[1] + '-' + m[2] : null;
}

/**
 * Which month each price row belongs to and where it goes, given the month `prices` holds now.
 *   current   same month (or `prices` is empty and takes this month)
 *   rollover  a later month: archive `prices`, empty it, then append
 *   archive   an earlier month already rolled over: goes to that month's archive spreadsheet
 * daily_summary is one tab forever: always current.
 */
function CW_route(tab, header, rows, currentPeriod) {
  if (tab !== 'prices') return [{ target: 'current', period: null, rows: rows }];
  var di = header.indexOf('date');
  var byQ = {};
  var order = [];
  for (var i = 0; i < rows.length; i++) {
    var q = CW_periodOf(rows[i][di]);
    if (!byQ[q]) { byQ[q] = []; order.push(q); }
    byQ[q].push(rows[i]);
  }
  order.sort();
  var cur = currentPeriod || null;
  var out = [];
  for (var j = 0; j < order.length; j++) {
    var qq = order[j];
    var target;
    if (!cur || qq === cur) { target = 'current'; cur = qq; }
    else if (qq > cur) { target = 'rollover'; cur = qq; }
    else target = 'archive';
    out.push({ target: target, period: qq, rows: byQ[qq] });
  }
  return out;
}

/** Rows whose key (column keyIndex) is neither already in the tab nor earlier in this file. */
function CW_dedupe(existingKeys, rows, keyIndex) {
  var seen = {};
  var k;
  for (var i = 0; i < existingKeys.length; i++) seen[String(existingKeys[i])] = true;
  var fresh = [];
  var dupes = 0;
  for (var j = 0; j < rows.length; j++) {
    k = String(rows[j][keyIndex]);
    if (seen[k]) { dupes += 1; continue; }
    seen[k] = true;
    fresh.push(rows[j]);
  }
  return { fresh: fresh, dupes: dupes };
}

/**
 * CSV strings -> Sheet cell values. Numbers become numbers, TRUE/FALSE booleans. Every text value
 * that Sheets would otherwise reinterpret is written as literal text: a leading = + - @ (a product
 * name must never become a formula), and digit strings like ZIPs and product ids (leading zeros
 * and long ids must survive).
 */
function CW_toCells(tab, header, rows) {
  var types = header.map(function (h) {
    if (CW_NUMBER.indexOf(h) >= 0) return 'n';
    if (CW_BOOL.indexOf(h) >= 0) return 'b';
    if (h === 'date') return 'd';
    return 't';
  });
  return rows.map(function (r) {
    return r.map(function (v, i) {
      var t = types[i];
      if (v === '' || v == null) return '';
      if (t === 'n') { var n = Number(v); return isFinite(n) ? n : ''; }
      if (t === 'b') return /^true$/i.test(v) ? true : /^false$/i.test(v) ? false : '';
      if (t === 'd') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "'" + v;
      if (/^[=+\-@]/.test(v) || /^[\d.]+$/.test(v)) return "'" + v;
      return v;
    });
  });
}

// ============================================================================ GOOGLE SERVICES (untested outside Google)

/** Run once from the editor: creates the tabs, installs the hourly trigger, imports what is waiting. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTabs_(ss);
  var created = ensureHourlyTrigger_();
  var base = folder_(CW_FOLDER, true);
  ['incoming', 'imported', 'archive'].forEach(function (n) { child_(base, n, true); });
  var result = importNew();
  var msg = (created ? 'Installed the hourly import trigger. ' : 'Hourly import trigger already installed. ') +
    'Watching My Drive/' + CW_FOLDER.join('/') + '/incoming. ' + result;
  Logger.log(msg);
  return msg;
}

/** The hourly trigger. Safe to run by hand at any time, and safe to run twice. */
function importNew() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 'Another import is running; skipped.';
  var started = Date.now();
  var report = [];
  try {
    ensureHourlyTrigger_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureTabs_(ss);
    var base = folder_(CW_FOLDER, true);
    var incoming = child_(base, 'incoming', true);
    var imported = child_(base, 'imported', true);
    var files = [];
    var it = incoming.getFiles();
    while (it.hasNext()) files.push(it.next());
    files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
    for (var i = 0; i < files.length; i++) {
      if (Date.now() - started > 4.5 * 60 * 1000) { report.push('time budget used; the rest waits for the next run'); break; }
      var f = files[i];
      var info = CW_classifyFile(f.getName());
      if (!info) continue; // .partial files and anything else are not ours to touch
      var table;
      try {
        table = CW_parseCsv(f.getBlob().getDataAsString('UTF-8'));
      } catch (e) {
        log_(ss, f.getName(), info.tab, null, 0, 0, 'waiting: ' + e.message);
        continue;
      }
      var check = CW_validate(info, table);
      if (!check.ok) {
        var ageH = (Date.now() - f.getLastUpdated().getTime()) / 3600000;
        if (ageH > 24) {
          f.moveTo(child_(base, 'rejected', true));
          log_(ss, f.getName(), info.tab, table.length - 1, 0, 0, 'REJECTED after 24 h: ' + check.error);
        } else {
          log_(ss, f.getName(), info.tab, table.length - 1, 0, 0, 'waiting: ' + check.error);
        }
        continue;
      }
      var res = importTable_(ss, info, table);
      f.moveTo(imported);
      log_(ss, f.getName(), info.tab, table.length - 1, res.added, res.dupes, res.note);
      report.push(f.getName() + ': +' + res.added + (res.dupes ? ' (' + res.dupes + ' already there)' : ''));
    }
  } finally {
    lock.releaseLock();
  }
  return report.length ? 'Imported: ' + report.join('; ') : 'Nothing new in incoming/.';
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cartworth').addItem('Import now', 'importNew').addItem('Set up / repair', 'setup').addToUi();
}

function ensureHourlyTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) if (triggers[i].getHandlerFunction() === CW_TRIGGER_HANDLER) return false;
  ScriptApp.newTrigger(CW_TRIGGER_HANDLER).timeBased().everyHours(1).create();
  return true;
}

function folder_(path, create) {
  var f = DriveApp.getRootFolder();
  for (var i = 0; i < path.length; i++) f = child_(f, path[i], create);
  return f;
}

function child_(parent, name, create) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  if (!create) throw new Error('Folder not found: ' + name);
  return parent.createFolder(name);
}

function ensureTabs_(ss) {
  tab_(ss, 'prices', CW_COLUMNS.prices);
  tab_(ss, 'daily_summary', CW_COLUMNS.daily_summary);
  tab_(ss, 'import_log', ['at', 'file', 'tab', 'rows_in_file', 'added', 'already_there', 'note']);
  readme_(ss);
  var blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
}

function tab_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Every allocated cell counts toward the 10M limit, used or not: keep exactly the columns we write.
    if (sh.getMaxColumns() > header.length) sh.deleteColumns(header.length + 1, sh.getMaxColumns() - header.length);
    if (sh.getMaxRows() > 2) sh.deleteRows(3, sh.getMaxRows() - 2);
    sh.getRange(1, 1).setNote(CW_POST_RULE);
  }
  return sh;
}

function readme_(ss) {
  var sh = ss.getSheetByName('README') || ss.insertSheet('README', 0);
  var rows = [
    ['Cartworth price tracker', ''],
    ['THE POST RULE', CW_POST_RULE],
    ['', 'Rows arrive hourly from My Drive/' + CW_FOLDER.join('/') + '/incoming, written each morning at 06:30 by the tracker on the Mac. Full detail (every kept row, flagged ones included and marked) is in the daily/ CSVs in the same folder.'],
    ['', 'prices holds ONE month. Earlier months are copied to ' + CW_FOLDER.join('/') + '/archive as "Cartworth prices <YYYY-MM> (archive)".'],
    ['', ''],
    ['BASIS', 'MEANING']
  ].concat(CW_BASES).concat([['', ''], ['COLUMN', 'MEANING']]).concat(CW_DOCS);
  sh.clear();
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1, 1, 2).setFontWeight('bold').setBackground('#fff2cc');
  sh.setColumnWidth(1, 190);
  sh.setColumnWidth(2, 820);
  sh.getRange(1, 2, rows.length, 1).setWrap(true);
}

function importTable_(ss, info, table) {
  var header = table[0];
  var rows = table.slice(1);
  var props = PropertiesService.getDocumentProperties();
  var added = 0;
  var dupes = 0;
  var notes = [];
  var plan = CW_route(info.tab, header, rows, props.getProperty('pricesPeriod'));
  for (var i = 0; i < plan.length; i++) {
    var p = plan[i];
    var target = ss;
    if (p.target === 'rollover') {
      notes.push(rollover_(ss, props.getProperty('pricesPeriod')));
    } else if (p.target === 'archive') {
      var id = props.getProperty('archive:' + p.period);
      if (id) target = SpreadsheetApp.openById(id);
      else notes.push(p.period + ' rows went to the current tab: no archive exists for that month');
    }
    if (info.tab === 'prices' && p.target !== 'archive') props.setProperty('pricesPeriod', p.period);
    var r = append_(target, info.tab, header, p.rows);
    if (r.rolledForSpace) notes.push(r.rolledForSpace);
    added += r.added;
    dupes += r.dupes;
  }
  return { added: added, dupes: dupes, note: notes.join('; ') || 'ok' };
}

function append_(ss, tabName, header, rows) {
  var sh = tab_(ss, tabName, header);
  var last = sh.getLastRow();
  var keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  var d = CW_dedupe(keys, rows, 0);
  if (!d.fresh.length) return { added: 0, dupes: d.dupes };
  var rolled = null;
  if (tabName === 'prices' && cells_(ss) + d.fresh.length * header.length > CW_CELL_LIMIT) {
    rolled = rollover_(ss, PropertiesService.getDocumentProperties().getProperty('pricesPeriod') + '-part');
    sh = tab_(ss, tabName, header);
    last = sh.getLastRow();
  }
  var need = last + d.fresh.length - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  sh.getRange(last + 1, 1, d.fresh.length, header.length).setValues(CW_toCells(tabName, header, d.fresh));
  return { added: d.fresh.length, dupes: d.dupes, rolledForSpace: rolled };
}

function cells_(ss) {
  return ss.getSheets().reduce(function (n, s) { return n + s.getMaxRows() * s.getMaxColumns(); }, 0);
}

/** Copy the whole spreadsheet to the archive folder, then empty `prices`. Returns a note. */
function rollover_(ss, period) {
  var archive = child_(folder_(CW_FOLDER, true), 'archive', true);
  var name = 'Cartworth prices ' + (period || 'earlier') + ' (archive)';
  var copy = DriveApp.getFileById(ss.getId()).makeCopy(name, archive);
  PropertiesService.getDocumentProperties().setProperty('archive:' + period, copy.getId());
  var sh = ss.getSheetByName('prices');
  var last = sh.getLastRow();
  if (last > 1) {
    sh.insertRowsAfter(sh.getMaxRows(), 1); // a sheet must keep one non-frozen row
    sh.deleteRows(2, last - 1);
  }
  return 'rolled ' + (period || 'earlier rows') + ' over to "' + name + '"';
}

function log_(ss, file, tab, rowsInFile, added, dupes, note) {
  var sh = tab_(ss, 'import_log', ['at', 'file', 'tab', 'rows_in_file', 'added', 'already_there', 'note']);
  sh.appendRow([new Date(), file, tab, rowsInFile, added, dupes, note]);
}
