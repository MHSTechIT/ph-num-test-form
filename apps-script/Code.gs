/**
 * MHS Invoice Dashboard — Sheet bridge.
 *
 * Deploy as a web app:
 *   1) Project Settings (gear icon) → Script Properties → Add "API_TOKEN" with a
 *      long random value (this becomes APPS_SCRIPT_TOKEN in .env.local).
 *   2) Deploy → New deployment → Type: Web app.
 *      Execute as: Me. Who has access: Anyone (with the link).
 *   3) Copy the deployment URL into APPS_SCRIPT_URL in .env.local.
 *
 * Endpoints (all GET, query string):
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
    const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected) return json({ error: 'server_misconfigured: API_TOKEN script property missing' });

    const params = (e && e.parameter) || {};
    if (params.token !== expected) return json({ error: 'unauthorized' });

    const action = params.action || 'sheet';
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'tabs') {
      return json({ tabs: ss.getSheets().map(function (s) { return s.getName(); }) });
    }

    if (action === 'sheet') {
      var name = params.name;
      if (!name) return json({ error: 'name_required' });
      var sheet = ss.getSheetByName(name);
      if (!sheet) return json({ error: 'sheet_not_found', name: name });
      var range = sheet.getDataRange();
      var values = range.getDisplayValues(); // strings only — preserves what user sees
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
