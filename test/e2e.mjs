// End-to-end check against a running `wrangler dev` (default http://127.0.0.1:8787).
// Two browsers: the owner and a visitor. Verifies presence, chat, activity, waves,
// privacy rules, the leaderboard, history, and removal.
import { chromium } from "playwright";
import WebSocket from "ws";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const OWNER_KEY = process.env.OWNER_KEY || "dev-owner-key";
let failed = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const errors = [];
async function open(name, hash = "") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(name + ": " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|ERR_|Failed to load resource|Unexpected response code: 403/.test(m.text())) errors.push(name + ": " + m.text()); });
  await page.goto(BASE + "/" + hash, { waitUntil: "domcontentloaded" });
  return page;
}

const owner = await open("owner", "#owner=" + OWNER_KEY);
await owner.waitForFunction(() => window.siteLive && !document.getElementById("liveBtn").hidden, null, { timeout: 15000 });
ok(!(await owner.evaluate(() => location.hash)), "owner key removed from the URL");
ok(await owner.evaluate(() => !!localStorage.getItem("on-owner-key")), "owner key stored on device");

const visitor = await open("visitor", "?utm_source=linkedin");
await visitor.waitForFunction(() => document.getElementById("hereTxt") && document.getElementById("hereTxt").textContent === "2", null, { timeout: 15000 });
ok(true, "visitor sees 2 people here");
ok(await visitor.evaluate(() => /Omar is here/.test(document.getElementById("omarHere").textContent)), "visitor sees 'Omar is here'");
ok(await visitor.evaluate(() => document.getElementById("liveBtn").hidden), "visitor has no Live panel button");

// Visitor tries to impersonate the owner.
await visitor.evaluate(() => window.siteLive.ready.then((r) => r.presence({ nm: "Omar", own: true })));
await sleep(500);

// Cursor movement shows up on the owner's screen.
await visitor.mouse.move(400, 300); await visitor.mouse.move(420, 320);
await owner.waitForFunction(() => document.querySelectorAll("#cursors .pc").length >= 1, null, { timeout: 5000 });
const label = await owner.evaluate(() => document.querySelector("#cursors .pc .nm").textContent);
ok(!/^Omar/.test(label), "impersonation blocked (cursor label: " + label + ")");

// Activity: a public act and a private act.
await visitor.evaluate(() => window.__act("won a series 4-2 with Curry, James and Jokić"));
await visitor.evaluate(() => window.__act("copied your email", true));
await sleep(600);
await owner.click("#liveBtn");
await sleep(300);
const panel = await owner.evaluate(() => document.getElementById("livePanel").innerText);
ok(/won a series 4-2/.test(panel), "owner panel shows visitor activity");
ok(/copied your email/.test(panel), "owner panel shows private activity");
ok(/via linkedin/.test(panel), "owner panel shows the referrer");
ok(/Linux|Mac|Windows/.test(panel), "owner panel shows the device");
ok(/Remove for 24h/.test(panel), "owner has a remove button");

// Privacy: a second plain visitor must not receive private acts, referrer, or network.
const spy = await new Promise((resolve) => {
  const ws = new WebSocket(BASE.replace("http", "ws") + "/live");
  const got = [];
  ws.on("open", () => ws.send(JSON.stringify({ type: "hello", key: "wrong", p: { nm: "Spy" } })));
  ws.on("message", (d) => got.push(JSON.parse(d.toString())));
  setTimeout(() => { ws.close(); resolve(got); }, 1200);
});
const init = spy.find((m) => m.type === "init");
ok(init && init.owner === false, "wrong key is not the owner");
const leaked = JSON.stringify(init.peers);
ok(!/copied your email/.test(leaked) && !/"ref"|"org"/.test(leaked), "non-owners never receive private acts, referrer, or network");

// Chat and reactions travel to others.
await visitor.evaluate(() => window.siteLive.ready.then((r) => r.presence({ msg: "hi from the test, see http://spam.example", mt: Date.now() })));
await owner.waitForFunction(() => { const s = document.querySelector("#cursors .say"); return s && /hi from the test/.test(s.textContent); }, null, { timeout: 5000 });
ok(await owner.evaluate(() => /\[link\]/.test(document.querySelector("#cursors .say").textContent)), "links in chat are stripped");

// Wave reaches the owner.
await visitor.click("#waveBtn");
await owner.waitForFunction(() => /waved at you/.test(document.getElementById("toast").textContent), null, { timeout: 5000 });
ok(true, "owner gets the wave");

// Leaderboard: play the game in the visitor's browser.
await visitor.evaluate(() => document.getElementById("t-game").scrollIntoView());
await visitor.fill("#handle", "e2e tester");
await visitor.click("#gGo");
const ans = [20, 20, 80, 80, 80];
for (let i = 0; i < 5; i++) {
  await visitor.$eval("#prob", (el, v) => { el.value = v; el.dispatchEvent(new Event("input")); }, ans[i]);
  await visitor.click("#gLock");
  await visitor.click("#gNext");
}
await visitor.waitForFunction(() => /e2e tester/.test(document.getElementById("board").textContent) && /Live leaderboard/.test(document.getElementById("gameNote").textContent), null, { timeout: 5000 });
const lb = await (await fetch(BASE + "/api/leaderboard")).json();
ok(lb.rows.some((r) => r.n === "e2e tester" && Math.abs(r.b - 0.04) < 1e-6), "score saved server-side with a server-computed Brier");

// Remove the visitor, then check the visit log.
const peerId = await owner.evaluate(() => window.siteLive.ready.then((r) => r.peers().find((p) => !p.isMe).peer));
await owner.evaluate((id) => window.siteLive.ready.then((r) => r.kick(id)), peerId);
await visitor.waitForFunction(() => document.getElementById("here").hidden, null, { timeout: 5000 });
ok(true, "removed visitor is disconnected");
await sleep(500);
const hist = await (await fetch(BASE + "/api/history", { headers: { "x-owner-key": OWNER_KEY } })).json();
const v = hist.rows.find((r) => r.ref === "linkedin");
ok(v && /won a series/.test(v.acts) && v.secs >= 1, "visit recorded with activity and duration");
ok(!hist.rows.some((r) => /Omar/.test(r.acts || "") && !r.ref), "owner visits are not logged");
await owner.click("#histBtn");
await owner.waitForFunction(() => /linkedin/.test(document.getElementById("histList").textContent), null, { timeout: 5000 });
ok(true, "owner sees Recent visits in the panel");

const rejoin = await open("visitor-again");
await sleep(2500);
ok(await rejoin.evaluate(() => document.getElementById("here").hidden), "removed visitor can't rejoin for 24h");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
