/**
 * MHS Invoice Dashboard — Sheet bridge.
 *
 * Reads from the spreadsheet whose ID is stored in the SHEET_ID script
 * property. Provides three endpoints:
 *
 *   ?action=index&sheets=<json>&classifications=002,003,004,005&token=...
 *       -> { index: [{phone, classification, sheet, displayName, matchedHeader, data}], errors }
 *       This is the primary endpoint the dashboard uses. Returns only rows
 *       where a phone number is present AND a cell in the row carries an
 *       allowed classification (`00X (...)`). The payload is small enough to
 *       cache in Next.js and filter in-memory for any phone lookup.
 *
 *   ?action=sheet&name=<TabName>&token=...   -> { sheet, headers, values }
 *   ?action=tabs&token=...                   -> { tabs: [...] }
 *
 * Setup:
 *   1) Project Settings (gear) → Script Properties:
 *        - API_TOKEN  = a long random string (must match APPS_SCRIPT_TOKEN in .env.local)
 *        - SHEET_ID   = the spreadsheet ID from its URL
 *   2) Deploy → New deployment → Web app.
 *      Execute as: Me. Who has access: Anyone (with the link).
 */

var ALLOWED_CLASSIFICATIONS_DEFAULT = ['002', '003', '004', '005'];
var PHONE_HEADER_RE = /(phone|mobile|alter\s*no|customer\s*phone|whatsapp|roll\s*number)/i;
var CLASSIFICATION_RE = /^\s*(0\d{2})\s*\(/;
var SHEET_CACHE_TTL_S = 600; // 10 min

function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('API_TOKEN');
    if (!expected) return json({ error: 'server_misconfigured: API_TOKEN script property missing' });

    var params = (e && e.parameter) || {};
    if (params.token !== expected) return json({ error: 'unauthorized' });

    var sheetId = props.getProperty('SHEET_ID');
    if (!sheetId) return json({ error: 'server_misconfigured: SHEET_ID script property missing' });

    var action = params.action || 'index';

    if (action === 'tabs') {
      var ss = SpreadsheetApp.openById(sheetId);
      return json({ tabs: ss.getSheets().map(function (s) { return s.getName(); }) });
    }

    if (action === 'sheet') {
      var name = params.name;
      if (!name) return json({ error: 'name_required' });
      var sheetData = readSheetCached_(sheetId, name);
      if (!sheetData) return json({ error: 'sheet_not_found', name: name });
      return json({ sheet: name, headers: sheetData.headers, values: sheetData.values });
    }

    if (action === 'index') {
      return doIndex_(sheetId, params);
    }

    return json({ error: 'unknown_action', action: action });
  } catch (err) {
    return json({ error: 'exception', message: String(err && err.message || err) });
  }
}

function doIndex_(sheetId, params) {
  var classifications = (params.classifications
    ? String(params.classifications).split(',').map(function (s) { return s.trim(); })
    : ALLOWED_CLASSIFICATIONS_DEFAULT
  ).filter(function (s) { return s.length > 0; });

  var sheetsConfig;
  try {
    sheetsConfig = JSON.parse(params.sheets || '[]');
  } catch (e) {
    return json({ error: 'invalid_sheets_param' });
  }
  if (!Array.isArray(sheetsConfig) || sheetsConfig.length === 0) {
    return json({ error: 'sheets_param_required' });
  }

  var classSet = {};
  for (var c = 0; c < classifications.length; c++) classSet[classifications[c]] = true;

  var index = [];
  var errors = [];

  for (var i = 0; i < sheetsConfig.length; i++) {
    var cfg = sheetsConfig[i] || {};
    var name = cfg.name;
    if (!name) {
      errors.push({ sheet: '?', message: 'missing name' });
      continue;
    }
    try {
      var sheetData = readSheetCached_(sheetId, name);
      if (!sheetData) { errors.push({ sheet: name, message: 'not_found' }); continue; }
      appendIndexEntries_(index, sheetData, cfg, classSet);
    } catch (err) {
      errors.push({ sheet: name, message: String(err && err.message || err) });
    }
  }

  return json({ index: index, errors: errors });
}

function appendIndexEntries_(out, sheetData, cfg, classSet) {
  var headers = sheetData.headers;
  var rows = sheetData.values;

  var hints = (cfg.phoneColumnHints || []).map(function (h) { return normalizeHeader_(h); });
  var phoneIdx = [];
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i] || '';
    if (!h) continue;
    var nh = normalizeHeader_(h);
    if (hints.indexOf(nh) >= 0 || PHONE_HEADER_RE.test(h)) phoneIdx.push(i);
  }
  if (phoneIdx.length === 0) return;

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    if (!row || row.length === 0) continue;

    // pick first phone hit
    var hitIdx = -1;
    var phone = null;
    for (var p = 0; p < phoneIdx.length; p++) {
      var idx = phoneIdx[p];
      var v = normalizePhone_(row[idx]);
      if (v) { hitIdx = idx; phone = v; break; }
    }
    if (hitIdx < 0) continue;

    // classification scan
    var classification = null;
    for (var k = 0; k < row.length; k++) {
      var cellv = row[k];
      if (cellv == null) continue;
      var s = String(cellv);
      var m = s.match(CLASSIFICATION_RE);
      if (m) { classification = m[1]; break; }
    }
    if (!classification || !classSet[classification]) continue;

    var dataObj = {};
    for (var c2 = 0; c2 < headers.length; c2++) {
      var hh = headers[c2] || ('__col_' + c2);
      dataObj[hh] = row[c2] != null ? row[c2] : '';
    }

    out.push({
      phone: phone,
      classification: classification,
      sheet: cfg.name,
      displayName: cfg.displayName || cfg.name,
      matchedHeader: headers[hitIdx],
      data: dataObj,
    });
  }
}

function readSheetCached_(sheetId, sheetName) {
  var cache = CacheService.getScriptCache();
  var key = 'sheet:' + sheetId + ':' + sheetName + ':v4';
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;
  var values = sheet.getDataRange().getDisplayValues();
  var headers = values.length > 0 ? values[0] : [];
  var data = {
    headers: headers,
    values: values.length > 1 ? values.slice(1) : [],
  };
  try {
    var serialised = JSON.stringify(data);
    if (serialised.length < 95000) {
      cache.put(key, serialised, SHEET_CACHE_TTL_S);
    }
  } catch (e) { /* skip cache on errors */ }
  return data;
}

function normalizePhone_(v) {
  if (v == null) return null;
  var s = String(v).replace(/[^\d]/g, '');
  if (s.length < 10) return null;
  return s.slice(-10);
}

function normalizeHeader_(h) {
  return String(h).replace(/\s+/g, ' ').trim().toLowerCase();
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
