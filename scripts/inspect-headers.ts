import { SHEETS } from "../lib/sheets-config";
import { fetchSheet } from "../lib/google-sheets";

async function main() {
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_OAUTH_CLIENT_ID) {
    console.error(
      "Missing OAuth env vars. Set GOOGLE_SHEETS_ID, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN in .env.local first."
    );
    process.exit(1);
  }

  for (const cfg of SHEETS) {
    try {
      const data = await fetchSheet(cfg.sheetName);
      console.log(`\n=== ${cfg.sheetName} (${data.headers.length} columns, ${data.rows.length} rows) ===`);
      data.headers.forEach((h, i) => console.log(`  ${String(i + 1).padStart(3)}: ${h}`));
    } catch (err) {
      console.log(`\n=== ${cfg.sheetName} === ERROR: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
