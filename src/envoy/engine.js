// Envoy v2 rules engine: a world-map strategy game over linked hotspots.
// Pure functions over a plain state object, so the Worker and Node tests run the same code.
// AI layers (typed messages, generated campaigns) only ever feed bounded inputs into this file.

import { CAMPAIGNS, CAMPAIGN_BY_ID } from "./campaigns.js";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const CARD_ORDER = ["red", "goal", "flex"];
export const COST = { listen: 1, message: 1, aid: 1, keepers: 2, summit: 2, deal: 2 };
export const SUMMIT_MOOD = 50;
export const WALKOUT = 2;

// Difficulty presets (Xbox Accessibility Guideline 108: several presets, respectful names, changeable anytime).
export const DIFFS = {
  relaxed: { name: "Relaxed", envoys: 1, drift: 0.5, world: 0.5, crisis: 0.6, deal: 1, reveal: true, noWar: true, walk: 1, mult: 0.5, text: "Every hand face up, gentle pressure, and the world never tips into war. For learning, or for exploring history." },
  standard: { name: "Standard", envoys: 0, drift: 1, world: 1, crisis: 1, deal: 0, walk: 2, mult: 1, text: "The intended game. Hidden cards, real pressure, and you can lose." },
  hard: { name: "Hard", envoys: 0, drift: 1.15, world: 1.15, crisis: 1.3, deal: 0, walk: 2, mult: 1.5, text: "Hotter hotspots and sharper crises. Every envoy counts." },
  brutal: { name: "Brutal", envoys: 0, drift: 1.3, world: 1.3, crisis: 1.5, deal: 0, hideRecon: true, walk: 3, mult: 2, text: "The hottest world, the harshest crises, no CR-AI guesses on thin sources, and longer walkouts." },
};
const D = (st) => DIFFS[st.diff] || DIFFS.standard;
const envoysFor = (st, camp) => Math.max(2, camp.envoys + D(st).envoys);

/* ---------- seeded RNG ---------- */
function rand(st) {
  let t = (st.seed = (st.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function campaignOf(st) {
  return st.camp || CAMPAIGN_BY_ID[st.c];
}
const hsDef = (camp, id) => camp.hotspots.find((h) => h.id === id);
const partyDef = (h, id) => h.parties.find((p) => p.id === id);

/* ---------- tags, weights, red lines ---------- */
export function weight(p, clause) {
  let w = 0;
  for (const t of clause.tags) {
    if (p.wants.includes(t)) w += 2;
    if (p.dislikes.includes(t)) w -= 2;
  }
  return w;
}
function redTags(p) {
  return [...new Set([...(p.red || []), ...Object.keys(p.redUnless || {})])];
}
// A red line fires when its tag is present, unless every "unless" tag for it is also present.
export function crossesRed(p, tags) {
  const set = new Set(tags);
  return redTags(p).some((t) => {
    if (!set.has(t)) return false;
    const unless = (p.redUnless || {})[t] || [];
    return !(unless.length && unless.every((u) => set.has(u)));
  });
}

/* ---------- setup ---------- */
function cardState(p, k) {
  const tier = p.tier || "documented";
  const c = (p.cards || {})[k] || {};
  if (tier === "documented") return "known";
  if (tier === "partial" && k === "goal") return "known";
  return c.r ? "recon" : "unknown";
}

export function newGame(campId, seed, twistId, customCamp, diff) {
  const camp = customCamp || CAMPAIGN_BY_ID[campId];
  if (!camp) throw new Error("unknown campaign");
  const st = {
    v: 2,
    c: camp.id,
    camp: customCamp || undefined,
    seed: seed >>> 0,
    diff: DIFFS[diff] ? diff : "standard",
    mult: (DIFFS[diff] || DIFFS.standard).mult,
    month: 1,
    envoys: 0,
    global: camp.globalStart,
    flareups: 0,
    deals: [],
    ended: false,
    outcome: null,
    twist: null,
    crisis: null,
    hs: {},
    log: [],
  };
  for (const h of camp.hotspots) {
    st.hs[h.id] = {
      tension: h.tension,
      peace: 0,
      talks: false,
      done: false,
      shield: 0,
      offered: [],
      clauses: null,
      parties: Object.fromEntries(h.parties.map((p) => [p.id, { mood: p.mood, walked: 0, cards: Object.fromEntries(CARD_ORDER.map((k) => [k, cardState(p, k)])) }])),
    };
  }
  st.envoys = envoysFor(st, camp);
  const tw = (camp.twists || []).find((t) => t.id === twistId);
  if (tw) {
    if (tw.fx) applyFx(st, tw.fx);
    st.twist = tw.id;
  }
  log(st, "start", camp.tagline);
  return st;
}

function log(st, kind, text, extra = {}) {
  st.log.push({ m: st.month, kind, text, ...extra });
  if (st.log.length > 60) st.log.splice(0, st.log.length - 60);
}

function applyFx(st, fx, harm = 1) {
  const fl = [];
  for (const [hid, d0] of Object.entries(fx.tension || {})) {
    const h = st.hs[hid];
    const d = d0 > 0 ? Math.round(d0 * harm) : d0;
    if (h && !h.done) {
      h.tension = clamp(h.tension + d);
      fl.push({ hs: hid, k: "tension", d });
    }
  }
  for (const [key, d] of Object.entries(fx.mood || {})) {
    const [hid, pid] = key.split(".");
    const p = st.hs[hid] && st.hs[hid].parties[pid];
    if (p) {
      p.mood = clamp(p.mood + d);
      fl.push({ hs: hid, party: pid, k: "mood", d });
    }
  }
  if (fx.global) {
    const g = fx.global > 0 ? Math.round(fx.global * harm) : fx.global;
    st.global = clamp(st.global + g);
    if (D(st).noWar) st.global = Math.min(st.global, 95);
    fl.push({ k: "global", d: g });
  }
  if (fx.envoys) st.envoys = Math.max(0, st.envoys + fx.envoys);
  return fl;
}

/* ---------- availability ---------- */
function summitNeed(n) {
  return Math.min(n, Math.max(2, Math.ceil(n * 0.6)));
}
export function canDo(st, a, hid) {
  if (st.ended) return "Game over";
  if (st.crisis) return "Resolve the crisis first";
  const h = st.hs[hid];
  if (!h) return "Pick a hotspot";
  if (h.done) return "Deal already signed here";
  if (!(a in COST)) return "Unknown move";
  if (st.envoys < COST[a]) return "Not enough envoys";
  if (a === "summit" && h.talks) return "Talks already open";
  if (a === "summit") {
    const n = Object.keys(h.parties).length;
    const ready = Object.values(h.parties).filter((p) => !p.walked && p.mood >= SUMMIT_MOOD).length;
    if (ready < summitNeed(n)) return `Needs ${summitNeed(n)} parties at ${SUMMIT_MOOD}+ mood`;
  }
  if (a === "deal" && !h.talks) return "Open talks first";
  if (a === "keepers" && h.shield) return "Peacekeepers already there";
  return "";
}

/* ---------- actions ---------- */
// For typed messages the AI supplies { clauses: [ids], tone: -2..2, reply }. Everything else is rules.
export function act(st, a, hid, opts = {}, ai = null) {
  const why = canDo(st, a, hid);
  if (why) return { error: why };
  const camp = campaignOf(st);
  const H = hsDef(camp, hid);
  const h = st.hs[hid];
  const out = { act: a, hs: hid, fx: [] };
  const pd = opts.party ? partyDef(H, opts.party) : null;
  const ps = pd ? h.parties[pd.id] : null;
  if ((a === "listen" || a === "message") && !pd) return { error: "Pick a party" };
  if (a === "message" && ps.walked) return { error: `${pd.short} walked out` };

  switch (a) {
    case "listen": {
      const key = CARD_ORDER.find((k) => ps.cards[k] !== "known");
      if (!key) return { error: `You already know ${pd.short}'s hand` };
      const was = ps.cards[key];
      ps.cards[key] = "known";
      ps.mood = clamp(ps.mood + 2);
      const c = (pd.cards || {})[key] || {};
      out.reveal = { party: pd.id, card: key, wasRecon: was === "recon", wrong: was === "recon" && c.ok === false };
      log(st, "intel", `${pd.short}: ${cardName(key)} revealed${out.reveal.wrong ? ". The reconstruction was wrong!" : "."}`, { hs: hid, party: pd.id });
      break;
    }
    case "message": {
      if (h.offered.includes(pd.id)) return { error: `One message to ${pd.short} per ${camp.unit.toLowerCase()}` };
      const clauseIds = (ai ? ai.clauses || [] : [opts.clause]).filter((id) => H.clauses.some((c) => c.id === id)).slice(0, 2);
      if (!ai && !clauseIds.length) return { error: "Pick something to offer" };
      const tone = ai ? Math.max(-2, Math.min(2, Math.round(Number(ai.tone) || 0))) : 0;
      let d = tone * 3;
      let verdict = tone > 0 ? "love" : tone < 0 ? "hate" : "neutral";
      const tags = clauseIds.flatMap((id) => H.clauses.find((c) => c.id === id).tags);
      if (tags.length && crossesRed(pd, tags)) {
        d = -15;
        verdict = "red";
        ps.cards.red = "known";
      } else if (clauseIds.length) {
        const w = clauseIds.reduce((s, id) => s + weight(pd, H.clauses.find((c) => c.id === id)), 0);
        if (w > 0) { d += 8 + Math.min(w, 4) * 2; verdict = "love"; }
        else if (w < 0) { d -= 6; verdict = "hate"; }
        else d += 1;
      }
      d = Math.max(-15, Math.min(18, d));
      ps.mood = clamp(ps.mood + d);
      h.offered.push(pd.id);
      out.fx.push({ hs: hid, party: pd.id, k: "mood", d });
      out.verdict = verdict;
      out.reply = (ai && ai.reply) || bark(pd, verdict, st.month);
      log(st, "msg", `${pd.short}: "${out.reply}"`, { hs: hid, party: pd.id, d, verdict });
      break;
    }
    case "aid": {
      h.tension = clamp(h.tension - 10);
      for (const p of Object.values(h.parties)) p.mood = clamp(p.mood + 2);
      out.fx.push({ hs: hid, k: "tension", d: -10 });
      log(st, "act", `Aid lands in ${H.name}.`, { hs: hid });
      break;
    }
    case "keepers": {
      h.tension = clamp(h.tension - 18);
      h.shield = 2;
      out.fx.push({ hs: hid, k: "tension", d: -18 });
      log(st, "act", `Peacekeepers deploy to ${H.name}.`, { hs: hid });
      for (const p of H.parties) {
        if (!h.parties[p.id].walked && crossesRed(p, ["foreign_troops"])) walkOut(st, H, p, "Foreign troops are their red line.", out);
      }
      break;
    }
    case "summit": {
      h.talks = true;
      h.peace = clamp(h.peace + 25);
      for (const p of Object.values(h.parties)) if (!p.walked) p.mood = clamp(p.mood + 4);
      log(st, "act", `Talks open on ${H.name}.`, { hs: hid });
      break;
    }
    case "deal": {
      const ids = [...new Set(opts.clauses || [])].filter((id) => H.clauses.some((c) => c.id === id));
      if (ids.length < 1 || ids.length > 3) return { error: "Pick 1 to 3 terms" };
      const tags = ["deal", ...ids.flatMap((id) => H.clauses.find((c) => c.id === id).tags)];
      const votes = H.parties.map((p) => {
        const s = h.parties[p.id];
        if (s.walked) return { party: p.id, yes: false, why: "absent" };
        if (crossesRed(p, tags)) return { party: p.id, yes: false, why: "red" };
        const v = ids.reduce((x, id) => x + weight(p, H.clauses.find((c) => c.id === id)), 0) + (s.mood - 50) / 10;
        const need = 2 - D(st).deal;
        return { party: p.id, yes: v >= need, why: v >= need ? "yes" : "no" };
      });
      const yes = votes.filter((v) => v.yes).length;
      const vetoNo = H.parties.filter((p) => p.veto && !votes.find((v) => v.party === p.id).yes);
      const need = H.parties.length >= 3 ? H.parties.length - 1 : H.parties.length;
      const passed = vetoNo.length === 0 && yes >= need;
      out.votes = votes;
      out.passed = passed;
      out.need = need;
      for (const v of votes) if (v.why === "red") walkOut(st, H, partyDef(H, v.party), "Your terms crossed their red line.", out);
      st.envoys -= COST.deal;
      if (passed) {
        h.done = true;
        h.clauses = ids;
        h.peace = 100;
        h.tension = 8;
        st.deals.push(hid);
        st.global = clamp(st.global - 12);
        for (const [x, y, w] of camp.links || []) {
          const other = x === hid ? y : y === hid ? x : null;
          if (other && !st.hs[other].done) st.hs[other].tension = clamp(st.hs[other].tension - Math.round(10 * w));
        }
        // A party that also sits at another table remembers what it won here.
        for (const p of H.parties) {
          for (const H2 of camp.hotspots) {
            if (H2.id === hid || st.hs[H2.id].done) continue;
            const p2 = H2.parties.find((x) => x.id === p.id);
            if (p2 && tags.some((t) => p2.wants.includes(t))) st.hs[H2.id].parties[p.id].mood = clamp(st.hs[H2.id].parties[p.id].mood + 12);
          }
        }
        log(st, "deal", `Deal signed in ${H.name}!`, { hs: hid, votes });
        if (st.deals.length >= camp.goal) finish(st, "win");
        return out;
      }
      h.peace = clamp(h.peace + yes * 4);
      for (const v of votes) if (v.why === "no") h.parties[v.party].mood = clamp(h.parties[v.party].mood - 3);
      log(st, "vote", `Vote failed in ${H.name}: ${yes} of ${H.parties.length} said yes.`, { hs: hid, votes });
      return out;
    }
  }
  st.envoys -= COST[a];
  return out;
}

const cardName = (k) => ({ red: "red line", goal: "real goal", flex: "flexibility" })[k];

function walkOut(st, H, p, why, out) {
  const s = st.hs[H.id].parties[p.id];
  if (s.walked) return;
  s.walked = D(st).walk || WALKOUT;
  s.mood = clamp(s.mood - 15);
  s.cards.red = "known";
  log(st, "walk", `${p.short} walked out. ${why}`, { hs: H.id, party: p.id });
  if (out) (out.walkouts = out.walkouts || []).push(p.id);
}

const BARKS = {
  love: ["Now we're talking.", "This, we can work with.", "Put that in writing.", "Finally, someone listens."],
  neutral: ["We'll consider it.", "Words are cheap.", "What else is on the table?", "Not enough."],
  hate: ["Not that.", "You're not helping.", "That costs us too much.", "Whose side are you on?"],
  red: ["Absolutely not.", "That is a line we don't cross.", "Never raise that again."],
};
function bark(p, verdict, m) {
  const list = BARKS[verdict] || BARKS.neutral;
  return list[(p.id.length + m) % list.length];
}

/* ---------- difficulty can change at any time; the score keeps the easiest multiplier used ---------- */
export function setDifficulty(st, diff) {
  if (!DIFFS[diff]) return { error: "Unknown difficulty" };
  if (st.ended) return { error: "Game over" };
  const camp = campaignOf(st);
  const before = envoysFor(st, camp);
  st.diff = diff;
  st.mult = Math.min(st.mult || 1, DIFFS[diff].mult);
  st.envoys = Math.max(0, st.envoys + (envoysFor(st, camp) - before));
  if (DIFFS[diff].noWar) st.global = Math.min(st.global, 95);
  log(st, "act", `Difficulty set to ${DIFFS[diff].name}.`);
  return { diff };
}

/* ---------- crisis cards ---------- */
export function resolveCrisis(st, choice) {
  if (st.ended) return { error: "Game over" };
  if (!st.crisis) return { error: "No crisis to resolve" };
  const ev = st.crisis;
  const c = ev.choices[choice === 1 ? 1 : 0];
  const fx = applyFx(st, c.fx || {}, D(st).crisis);
  log(st, "crisis", `${ev.title}: you chose "${c.label}".`, { hs: ev.hs });
  st.crisis = null;
  if (st.global >= 100 && !D(st).noWar) finish(st, "war");
  return { fx };
}

function drawCrisis(st) {
  const camp = campaignOf(st);
  const ok = (e) => !e.hs || (st.hs[e.hs] && !st.hs[e.hs].done);
  st.usedEv = st.usedEv || [];
  let pool = camp.events.map((e, i) => ({ e, i })).filter(({ e, i }) => !st.usedEv.includes(i) && ok(e));
  if (!pool.length) {
    st.usedEv = [];
    pool = camp.events.map((e, i) => ({ e, i })).filter(({ e }) => ok(e));
  }
  if (!pool.length) return;
  const pick = pool[Math.floor(rand(st) * pool.length)];
  st.usedEv.push(pick.i);
  st.crisis = { hs: pick.e.hs || null, title: pick.e.title, choices: pick.e.choices.slice(0, 2).map((c) => ({ label: c.label, fx: c.fx || {} })) };
}

/* ---------- end of month ---------- */
export function endMonth(st) {
  if (st.ended) return { error: "Game over" };
  if (st.crisis) return { error: "Resolve the crisis first" };
  const camp = campaignOf(st);
  const out = { drift: {}, flares: [] };
  const before = st.global;

  for (const H of camp.hotspots) {
    const h = st.hs[H.id];
    if (h.done) continue;
    if (h.shield) {
      h.shield -= 1;
      out.drift[H.id] = 0;
      continue;
    }
    const d = Math.round((3 + Math.floor(rand(st) * 6) - (h.talks ? 3 : 0)) * D(st).drift);
    h.tension = clamp(h.tension + d);
    out.drift[H.id] = d;
  }
  // Flare-ups chain across links like an outbreak. Each hotspot flares at most once a turn.
  const flared = new Set();
  const queue = camp.hotspots.filter((H) => !st.hs[H.id].done && st.hs[H.id].tension >= 100).map((H) => H.id);
  while (queue.length) {
    const id = queue.shift();
    if (flared.has(id)) continue;
    flared.add(id);
    const h = st.hs[id];
    h.tension = 72;
    h.peace = clamp(h.peace - 20);
    st.global = clamp(st.global + Math.round(8 * D(st).world));
    st.flareups += 1;
    out.flares.push(id);
    log(st, "flare", `${hsDef(camp, id).name} flares up!`, { hs: id });
    for (const [a, b, w] of camp.links || []) {
      const o = a === id ? b : b === id ? a : null;
      if (!o || st.hs[o].done) continue;
      st.hs[o].tension = clamp(st.hs[o].tension + Math.round(14 * w));
      if (st.hs[o].tension >= 100 && !flared.has(o)) queue.push(o);
    }
  }
  const pressure = camp.hotspots.reduce((s, H) => s + (st.hs[H.id].done ? 0 : Math.max(0, st.hs[H.id].tension - 70)), 0);
  st.global = clamp(st.global + Math.round((pressure / 12) * D(st).world));
  if (D(st).noWar) st.global = Math.min(st.global, 95);
  out.globalDelta = st.global - before;

  for (const H of camp.hotspots) {
    const h = st.hs[H.id];
    h.offered = [];
    for (const p of H.parties) {
      const s = h.parties[p.id];
      if (s.walked) {
        s.walked -= 1;
        if (!s.walked) log(st, "back", `${p.short} is back at the table.`, { hs: H.id, party: p.id });
      }
    }
  }

  if (st.global >= 100 && !D(st).noWar) {
    finish(st, "war");
    return out;
  }
  if (st.month >= camp.months) {
    finish(st, st.deals.length >= camp.goal ? "win" : "timeout");
    return out;
  }
  st.month += 1;
  st.envoys = envoysFor(st, camp);
  drawCrisis(st);
  return out;
}

function finish(st, outcome) {
  st.ended = true;
  st.outcome = outcome;
  st.crisis = null;
  const camp = campaignOf(st);
  let s = st.deals.length * 400 + (100 - st.global) * 4 - st.flareups * 40;
  for (const H of camp.hotspots) s += Math.round(st.hs[H.id].peace / 2);
  if (outcome === "win") s += 500 + (camp.months - st.month) * 60;
  st.score = Math.max(0, Math.round(s * (st.mult || 1)));
  log(st, "end", { win: "You did it.", war: "The world tipped into war.", timeout: "Time ran out." }[outcome]);
}

/* ---------- views ---------- */
export function view(st) {
  const camp = campaignOf(st);
  const over = st.ended;
  return {
    c: camp.id,
    custom: !!st.camp,
    era: camp.era,
    year: camp.year,
    title: camp.title,
    tagline: camp.tagline,
    unit: camp.unit,
    months: camp.months,
    maxEnvoys: camp.envoys,
    goal: camp.goal,
    note: camp.note,
    twist: st.twist,
    diff: st.diff || "standard",
    mult: st.mult || 1,
    noWar: !!D(st).noWar,
    month: st.month,
    envoys: st.envoys,
    global: st.global,
    flareups: st.flareups,
    deals: st.deals,
    ended: st.ended,
    outcome: st.outcome,
    score: st.ended ? st.score : null,
    crisis: st.crisis ? { hs: st.crisis.hs, title: st.crisis.title, choices: st.crisis.choices.map((c) => ({ label: c.label, hint: fxHint(camp, c.fx) })) } : null,
    links: camp.links || [],
    log: st.log.slice(-30),
    hotspots: camp.hotspots.map((H) => {
      const h = st.hs[H.id];
      return {
        id: H.id,
        name: H.name,
        lat: H.lat,
        lon: H.lon,
        flavor: H.flavor,
        tension: h.tension,
        peace: h.peace,
        talks: h.talks,
        done: h.done,
        shield: h.shield,
        signed: h.clauses,
        need: summitNeed(H.parties.length),
        forecast: forecastOf(st, h),
        clauses: H.clauses.map((c) => ({ id: c.id, name: c.name })),
        history: over && H.history ? H.history : null,
        offered: h.offered,
        parties: H.parties.map((p) => {
          const s = h.parties[p.id];
          const cards = {};
          for (const k of CARD_ORDER) {
            let stt = over || D(st).reveal ? "known" : s.cards[k];
            if (stt === "recon" && D(st).hideRecon) stt = "unknown";
            const c = (p.cards || {})[k] || {};
            cards[k] = { s: stt, t: stt === "known" ? c.t || null : stt === "recon" ? c.r : null, wrong: over && c.r && c.ok === false && cardState(p, k) === "recon" ? c.r : null };
          }
          const goalKnown = over || D(st).reveal || s.cards.goal === "known";
          const redKnown = over || D(st).reveal || s.cards.red === "known";
          return {
            id: p.id,
            name: p.name,
            short: p.short,
            icon: p.icon,
            veto: !!p.veto,
            tier: p.tier || "documented",
            docs: p.docs ?? null,
            mood: s.mood,
            walked: s.walked,
            cards,
            lean: goalKnown ? Object.fromEntries(H.clauses.map((c) => [c.id, Math.sign(weight(p, c))])) : null,
            redOn: redKnown ? H.clauses.filter((c) => crossesRed(p, c.tags)).map((c) => c.id) : null,
          };
        }),
      };
    }),
  };
}

// Telegraph next month (the Into the Breach lesson): will this hotspot flare if left alone?
function forecastOf(st, h) {
  if (h.done || h.shield) return null;
  const lo = Math.round((3 - (h.talks ? 3 : 0)) * D(st).drift);
  const hi = Math.round((8 - (h.talks ? 3 : 0)) * D(st).drift);
  if (h.tension + lo >= 100) return "will";
  if (h.tension + hi >= 100) return "may";
  return null;
}

// Crisis consequences as structured chips: { label, value, good }.
function fxHint(camp, fx) {
  const out = [];
  for (const [hid, d] of Object.entries(fx.tension || {})) out.push({ label: (hsDef(camp, hid) || {}).name || hid, value: `tension ${d > 0 ? "+" : ""}${d}`, good: d < 0 });
  for (const [key, d] of Object.entries(fx.mood || {})) {
    const [hid, pid] = key.split(".");
    const H = hsDef(camp, hid);
    const p = H && partyDef(H, pid);
    out.push({ label: p ? p.short : pid, value: d > 0 ? "warmer" : "colder", good: d > 0 });
  }
  if (fx.global) out.push({ label: "World", value: `${fx.global > 0 ? "+" : ""}${fx.global}`, good: fx.global < 0 });
  if (fx.envoys) out.push({ label: "Envoys", value: String(fx.envoys), good: false });
  return out;
}

export function catalog() {
  return CAMPAIGNS.map(summaryOf);
}
export function summaryOf(c) {
  return {
    id: c.id,
    era: c.era,
    year: c.year,
    title: c.title,
    tagline: c.tagline,
    months: c.months,
    unit: c.unit,
    goal: c.goal,
    hotspots: c.hotspots.map((h) => ({ id: h.id, name: h.name, lat: h.lat, lon: h.lon })),
    twists: (c.twists || []).map(({ id, name, text }) => ({ id, name, text })),
  };
}
