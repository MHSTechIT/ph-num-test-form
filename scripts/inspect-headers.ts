import { SHEETS } from "../lib/sheets-config";

async function main() {
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  if (!url || !token) {
    console.error("Missing APPS_SCRIPT_URL or APPS_SCRIPT_TOKEN. Set them in .env.local first.");
    process.exit(1);
  }

  const tabsRes = await fetch(`${url}?action=tabs&token=${encodeURIComponent(token)}`, {
    redirect: "follow",
  });
  const tabsPayload = (await tabsRes.json()) as { tabs?: string[]; error?: string };
  if (tabsPayload.error) {
    console.error("Failed to list tabs:", tabsPayload.error);
    process.exit(1);
  }
  console.log("All tabs in spreadsheet:", tabsPayload.tabs);

  for (const cfg of SHEETS) {
    const u = new URL(url);
    u.searchParams.set("action", "sheet");
    u.searchParams.set("name", cfg.sheetName);
    u.searchParams.set("token", token);
    try {
      const res = await fetch(u.toString(), { redirect: "follow" });
      const payload = (await res.json()) as
        | { sheet: string; headers: string[]; values: string[][] }
        | { error: string };
      console.log(`\n=== ${cfg.sheetName} ===`);
      if ("error" in payload) {
        console.log("  ERROR:", payload.error);
        continue;
      }
      console.log(`  ${payload.headers.length} columns`);
      payload.headers.forEach((h, i) => console.log(`  ${String(i + 1).padStart(3)}: ${h}`));
    } catch (err) {
      console.log(`\n=== ${cfg.sheetName} === ERROR:`, err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
