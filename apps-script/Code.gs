/**
 * MHS Invoice Dashboard — Sheet bridge.
 *
 * Reads from the spreadsheet whose ID is stored in the SHEET_ID script
 * property and (for ?action=lookup) does the phone-match + classification
 * filter server-side so responses are tiny.
 *
 * Setup:
 *   1) Project Settings (gear) → Script Properties:
 *        - API_TOKEN  = a long random string (must match APPS_SCRIPT_TOKEN in .env.local)
 *        - SHEET_ID   = the spreadsheet ID from its URL
 *   2) Deploy → New deployment → Web app.
 *      Execute as: Me. Who has access: Anyone (with the link).
 *   3) Copy the deployment URL into APPS_SCRIPT_URL in .env.local.
 *
 * Endpoints (GET, query string):
 *   ?action=lookup&phone=9876543210&sheets=<json>&classifications=002,003,004,005&token=...
 *       -> { query, results: [{ sheet, displayName, matchedHeaders, rows: [{classification, data}] }], errors }
 *   ?action=sheet&name=<TabName>&token=...   -> { sheet, headers, values }
 *   ?action=tabs&token=...                   -> { tabs: [...] }
 */

var ALLOWED_CLASSIFICATIONS_DEFAULT = ['002', '003', '004', '005'];
var PHONE_HEADER_RE = /(phone|mobile|alter\s*no|customer\s*phone|whatsapp)/i;
var CLASSIFICATION_RE = /^\s*(0\d{2})\s*\(/;
var SHEET_CACHE_TTL_S = 300; // 5 min

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

    var action = params.action || 'sheet';

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

    if (action === 'lookup') {
      return doLookup_(sheetId, params);
    }

    return json({ error: 'unknown_action', action: action });
  } catch (err) {
    return json({ error: 'exception', message: String(err && err.message || err) });
  }
}

function doLookup_(sheetId, params) {
  var phone = normalizePhone_(params.phone);
  if (!phone) return json({ error: 'phone_required_or_invalid' });

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

  var results = [];
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
      if (!sheetData) {
        errors.push({ sheet: name, message: 'not_found' });
        continue;
      }
      var matched = matchSheet_(sheetData, cfg, phone, classifications);
      if (matched.rows.length > 0) {
        results.push({
          sheet: name,
          displayName: cfg.displayName || name,
          matchedHeaders: matched.matchedHeaders,
          rows: matched.rows,
        });
      }
    } catch (err) {
      errors.push({ sheet: name, message: String(err && err.message || err) });
    }
  }

  return json({ query: phone, results: results, errors: errors });
}

function matchSheet_(sheetData, cfg, phone, classifications) {
  var headers = sheetData.headers;
  var rows = sheetData.values;
  var hints = (cfg.phoneColumnHints || []).map(function (h) { return normalizeHeader_(h); });

  // Phone column indexes
  var phoneIdx = [];
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (!h) continue;
    var nh = normalizeHeader_(h);
    if (hints.indexOf(nh) >= 0 || PHONE_HEADER_RE.test(h)) {
      phoneIdx.push(i);
    }
  }
  if (phoneIdx.length === 0) return { matchedHeaders: [], rows: [] };

  var classificationSet = {};
  for (var c = 0; c < classifications.length; c++) classificationSet[classifications[c]] = true;

  var matchedHeaders = {};
  var matchedRows = [];

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    if (!row || row.length === 0) continue;

    // phone match
    var hitIdx = -1;
    for (var p = 0; p < phoneIdx.length; p++) {
      var idx = phoneIdx[p];
      var candidate = normalizePhone_(row[idx]);
      if (candidate && candidate === phone) {
        hitIdx = idx;
        break;
      }
    }
    if (hitIdx < 0) continue;

    // classification scan
    var classification = null;
    for (var k = 0; k < row.length; k++) {
      var v = row[k];
      if (v == null) continue;
      var s = String(v);
      var m = s.match(CLASSIFICATION_RE);
      if (m) {
        classification = m[1];
        break;
      }
    }
    if (!classification || !classificationSet[classification]) continue;

    matchedHeaders[headers[hitIdx]] = true;

    var dataObj = {};
    for (var c2 = 0; c2 < headers.length; c2++) {
      var h2 = headers[c2] || ('__col_' + c2);
      dataObj[h2] = row[c2] != null ? row[c2] : '';
    }
    matchedRows.push({ classification: classification, data: dataObj });
  }

  return { matchedHeaders: Object.keys(matchedHeaders), rows: matchedRows };
}

function readSheetCached_(sheetId, sheetName) {
  var cache = CacheService.getScriptCache();
  var key = 'sheet:' + sheetId + ':' + sheetName;
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
  // CacheService values capped at 100KB. If too big, skip cache rather than fail.
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
