// The live campaign builder returns untrusted JSON from a model. Check the sanitizer turns messy
// output into a playable campaign and rejects garbage.
import { sanitizeCampaign } from "../src/envoy/llm.js";
import { newGame, act, endMonth, resolveCrisis, view } from "../src/envoy/engine.js";
import assert from "node:assert";

const messy = {
  era: "past", year: "1999", title: "Kosovo — 1999 War With An Extremely Long Title That Goes On", unit: "Weeks",
  hotspots: [{
    id: "Kosovo!!", name: "Kosovo", lat: 42.6, lon: 20.9, tension: 120, flavor: "x".repeat(300),
    clauses: [{ id: "withdraw", name: "Serb forces withdraw", tags: ["Withdrawal"] }, { id: "kfor", name: "NATO-led force", tags: ["foreign_troops", "security"] }, { name: "Autonomy", tags: [] }, { id: "refugees", name: "Refugees return", tags: ["refugees"] }],
    parties: [
      { id: "serbia", name: "Yugoslav government", icon: "🇷🇸 flag", wants: ["sovereignty_not_a_clause"], dislikes: ["withdrawal"], red: ["foreign_troops"], cards: { goal: { t: "Keep Kosovo." } } },
      { id: "kla", name: "KLA", veto: false, tier: "thin", wants: ["withdrawal", "refugees"], cards: { goal: { t: "Independence.", r: "Pure terrorists.", ok: false } } },
      { id: "nato", name: "NATO", wants: ["security", "refugees"] },
    ],
    history: { text: "Kumanovo Agreement, UNSCR 1244.", clauses: ["withdraw", "kfor", "made_up"] },
  }],
  links: [["kosovo", "nowhere", 2]],
  events: [{ hs: "kosovo", title: "Racak massacre reported", choices: [{ label: "Ultimatum", fx: { tension: { kosovo: 40 }, mood: { "kosovo.serbia": -99, "fake.x": 3 } } }, { label: "Monitors", fx: { envoys: -5 } }] }, { title: "bad event" }],
};
const c = sanitizeCampaign(messy, "Kosovo 1999");
assert(!c.error, c.error);
const H = c.hotspots[0];
assert.equal(H.id, "kosovo");
assert(H.tension <= 80 && H.flavor.length <= 90);
assert(c.title.indexOf("—") < 0, "no em dashes");
assert(H.parties.some((p) => p.veto), "someone has a veto");
assert(H.parties.every((p) => p.wants.length), "every party wants something");
assert.deepEqual(H.history.clauses, ["withdraw", "kfor"]);
assert.equal(c.links.length, 0);
const ev = c.events.find((e) => e.title.startsWith("Racak"));
assert.equal(ev.choices[0].fx.tension.kosovo, 15);
assert.equal(ev.choices[0].fx.mood["kosovo.serbia"], -15);
assert(!("fake.x" in ev.choices[0].fx.mood));
assert.equal(ev.choices[1].fx.envoys, -1);

// The result must be playable through the engine end to end.
const st = newGame(c.id, 42, "asis", c);
for (let m = 0; m < 20 && !st.ended; m++) {
  if (st.crisis) resolveCrisis(st, 0);
  for (const p of H.parties) act(st, "message", "kosovo", { party: p.id, clause: H.clauses.find((x) => p.wants.some((t) => x.tags.includes(t)))?.id || H.clauses[0].id });
  endMonth(st);
}
assert(st.ended);
assert(view(st).hotspots[0].history);
assert.deepEqual(sanitizeCampaign({ hotspots: [] }, "x").error ? 1 : 0, 1);
console.log("sanitizer ok:", c.title, "|", H.parties.map((p) => `${p.short}${p.veto ? "*" : ""}:${p.wants}`).join(" "), "| outcome", st.outcome);
