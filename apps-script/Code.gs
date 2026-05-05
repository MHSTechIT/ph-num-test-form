/**
 * MHS Invoice Dashboard — Sheet bridge.
 *
 * Reads from the spreadsheet whose ID is stored in the SHEET_ID script
 * property, so the bound document doesn't matter and you can switch
 * spreadsheets without redeploying.
 *
 * One-time setup:
 *   1) Project Settings (gear icon) → Script Properties:
 *        - API_TOKEN  = a long random string (must match APPS_SCRIPT_TOKEN in .env.local)
 *        - SHEET_ID   = the spreadsheet ID from its URL
 *   2) Deploy → New deployment → Web app.
 *      Execute as: Me. Who has access: Anyone (with the link).
 *   3) Copy the deployment URL into APPS_SCRIPT_URL in .env.local.
 *
 * To switch to a different spreadsheet later, just update the SHEET_ID
 * script property and click Deploy → Manage deployments → New version.
 *
 * Endpoints (GET, query string):
 *   ?action=sheet&name=<TabName>&token=...   -> { sheet, headers, values }
 *   ?action=tabs&token=...                   -> { tabs: [...] }
 */

function doGet(e) {
  return handle(e);
}

function doPost(e) {
  return handle(e);
}

function handle(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('API_TOKEN');
    if (!expected) return json({ error: 'server_misconfigured: API_TOKEN script property missing' });

    var params = (e && e.parameter) || {};
    if (params.token !== expected) return json({ error: 'unauthorized' });

    var sheetId = props.getProperty('SHEET_ID');
    if (!sheetId) return json({ error: 'server_misconfigured: SHEET_ID script property missing' });

    var ss = SpreadsheetApp.openById(sheetId);

    var action = params.action || 'sheet';

    if (action === 'tabs') {
      return json({ tabs: ss.getSheets().map(function (s) { return s.getName(); }) });
    }

    if (action === 'sheet') {
      var name = params.name;
      if (!name) return json({ error: 'name_required' });
      var sheet = ss.getSheetByName(name);
      if (!sheet) return json({ error: 'sheet_not_found', name: name });
      var values = sheet.getDataRange().getDisplayValues();
      var headers = values.length > 0 ? values[0] : [];
      var rows = values.length > 1 ? values.slice(1) : [];
      return json({ sheet: name, headers: headers, values: rows });
    }

    return json({ error: 'unknown_action', action: action });
  } catch (err) {
    return json({ error: 'exception', message: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
