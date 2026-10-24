// End-to-end: the Lab API on a local Worker, and the Lab panel in a real browser (desktop and phone).
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:8799";
let failed = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) failed++; };
const j = (r) => r.json();

const ont = await fetch(BASE + "/api/envoy/ontology?c=now").then(j);
ok(ont.families && ont.families.security && ont.campaign && ont.campaign.tables.length === 6, "ontology endpoint returns families and the canonical 2026 world");
ok(ont.campaign.tables[0].actors.some((a) => a.kind === "armed" && !a.playable), "armed actors are flagged AI-only");

const bt = await fetch(BASE + "/api/envoy/backtest").then(j);
ok(bt.cases && bt.cases.length === 6 && bt.meanRecall >= 60, `backtest endpoint: ${bt.cases && bt.cases.length} cases, mean recall ${bt.meanRecall}%, distractors ${bt.distractors}`);

const post = (b) => fetch(BASE + "/api/envoy/lab", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(b) }).then(j);
const r1 = await post({ c: "now", text: "Tehran drops its red line on missile caps and Washington warms up", n: 120 });
ok(!r1.error && r1.hypothesis.ops.length >= 2 && r1.base && r1.after, `lab: plain words become ops without AI (${r1.source}; ${r1.hypothesis && r1.hypothesis.ops.length} ops; ${r1.verdict})`);
const r2 = await post({ c: "now", text: "Lithium for schools", n: 120, ops: [
  { op: "add_clause", hs: "afg", id: "lithium", name: "Lithium concession for schools", tags: ["lithium_deal", "education"] },
  { op: "add_party", hs: "afg", id: "miners", name: "Lithium consortium", short: "Miners", kind: "company", wants: ["lithium_deal"] },
  { op: "shift", hs: "afg", party: "taliban", wants: ["+lithium_deal"] },
] });
const afg = r2.tables && r2.tables.find((t) => t.id === "afg");
ok(!r2.error && afg && afg.after > afg.before, `lab: explicit ops run (${afg && afg.before}% to ${afg && afg.after}% on Afghanistan)`);
const r3 = await post({ c: "now", text: "hi", n: 120 });
ok(r3.error, "lab: too-short text is rejected");
const r4 = await post({ c: "nope", text: "Tehran drops its red line on missile caps", n: 120 });
ok(r4.error, "lab: unknown scenario is rejected");
const r5 = await post({ c: "now", text: "The weather is nice this week everywhere", n: 120 });
ok(r5.error, "lab: text with no modelled change is rejected with guidance");

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const errors = [];
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp });
  page.on("pageerror", (e) => errors.push(name + ": " + e.message));
  await page.goto(BASE + "/envoy", { waitUntil: "networkidle" });
  await page.waitForSelector("#camps .camp", { timeout: 10000 });
  await page.fill("#lq", "Tehran drops its red line on missile caps");
  await page.click("#lgo");
  await page.waitForSelector("#labOut .verdict", { timeout: 20000 });
  const txt = await page.textContent("#labOut");
  ok(/Odds a deal is signed/.test(txt) && /Zone of agreement/.test(txt), `${name}: lab renders verdict, odds and zone`);
  const chips = await page.$$("#labOut .ops .chip");
  ok(chips.length >= 1, `${name}: ${chips.length} change chip(s) shown`);
  if (chips.length > 1) {
    await chips[0].click();
    await page.waitForFunction(() => /Running/.test(document.getElementById("lgo").textContent) || true);
    await page.waitForSelector("#labOut .verdict", { timeout: 20000 });
    const n2 = (await page.$$("#labOut .ops .chip")).length;
    ok(n2 === chips.length - 1, `${name}: dropping a change reruns with ${n2} chip(s)`);
  }
  await page.click(".bt summary");
  await page.waitForSelector(".btt", { timeout: 15000 });
  ok((await page.$$(".btt tbody tr")).length === 6, `${name}: backtest table lists 6 agreements`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(sw, `${name}: no horizontal scroll`);
  await page.close();
}
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll lab e2e checks passed");
process.exit(failed ? 1 : 0);
