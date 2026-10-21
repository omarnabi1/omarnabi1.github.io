// Envoy rules engine. Pure functions over a plain state object, so it runs the same in the
// Worker and in Node tests. The LLM never touches these numbers directly: it only returns a
// bounded grade for a back-channel pitch, which this file turns into capped effects.

import { SCENARIOS, DIMENSIONS, MOVES } from "./scenarios.js";

export const CAPITAL_PER_TURN = 6;
export const CAPITAL_CARRY = 2;
export const MAX_GUARANTORS = 2;
export const WALKOUT_TURNS = 2;
const CARD_ORDER = ["red", "goal", "flex"];

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

/* ---------- seeded RNG (state carries its own seed so replays are deterministic) ---------- */
function rand(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---------- evidence tiers ---------- */
export function tierOf(coverage) {
  if (coverage >= 50) return "documented";
  if (coverage >= 10) return "partial";
  return "thin";
}

function initialCardState(actor, key) {
  const tier = tierOf(actor.coverage);
  const card = actor.cards[key];
  if (tier === "documented") return "known";
  if (tier === "partial" && key === "goal") return "known";
  return card.recon ? "recon" : "unknown";
}

/* ---------- new game ---------- */
export function newGame(scenarioId, seed) {
  const sc = SCENARIOS[scenarioId];
  if (!sc) throw new Error("unknown scenario");
  const actors = {};
  for (const a of sc.actors) {
    actors[a.id] = {
      trust: a.trust,
      stance: a.stance,
      walked: 0,
      cards: Object.fromEntries(CARD_ORDER.map((k) => [k, initialCardState(a, k)])),
    };
  }
  const state = {
    v: 1,
    sc: sc.id,
    seed: seed >>> 0,
    turn: 1,
    capital: CAPITAL_PER_TURN,
    scores: { ...sc.scores },
    start: { ...sc.scores },
    actors,
    talks: false,
    monitors: false,
    guarantors: [],
    used: [],
    walkouts: 0,
    deals: 0,
    ended: false,
    outcome: null,
    log: [{ t: 1, kind: "start", text: sc.blurb }],
  };
  state.scores.alignment = alignmentOf(state);
  state.start.alignment = state.scores.alignment;
  return state;
}

function alignmentOf(state) {
  const s = Object.values(state.actors).map((a) => (a.walked ? a.stance * 0.5 : a.stance));
  const mean = s.reduce((x, y) => x + y, 0) / s.length;
  const sd = Math.sqrt(s.reduce((x, y) => x + (y - mean) * (y - mean), 0) / s.length);
  return clamp(mean - sd * 0.6);
}

function actorDef(sc, id) {
  return sc.actors.find((a) => a.id === id);
}

function addLog(state, kind, text, extra = {}) {
  state.log.push({ t: state.turn, kind, text, ...extra });
  if (state.log.length > 80) state.log.splice(1, state.log.length - 80);
}

function applyScores(state, delta, factor = 1) {
  for (const [k, v] of Object.entries(delta || {})) {
    if (k in state.scores && k !== "alignment") state.scores[k] = clamp(state.scores[k] + v * factor);
  }
}

function applyActorDelta(state, field, delta, factor = 1) {
  for (const [id, v] of Object.entries(delta || {})) {
    const a = state.actors[id];
    if (a) a[field] = clamp(a[field] + v * factor);
  }
}

/* ---------- red lines ---------- */
// A red line fires when any of its tags is present, unless every "unless" tag is also present.
export function crossesRedLine(actor, tags) {
  const red = actor.cards.red;
  if (!red.tags || !red.tags.length) return false;
  const set = new Set(tags);
  if (!red.tags.some((t) => set.has(t))) return false;
  if (red.unless && red.unless.length && red.unless.every((t) => set.has(t))) return false;
  return true;
}

function walkOut(state, sc, id, why) {
  const a = state.actors[id];
  const def = actorDef(sc, id);
  if (!a || a.walked) return;
  a.walked = WALKOUT_TURNS;
  a.trust = clamp(a.trust - 15);
  a.stance = clamp(a.stance - 8);
  a.cards.red = "known";
  state.walkouts += 1;
  addLog(state, "walkout", `${def.short} walked out. ${why}`, { actor: id });
}

/* ---------- moves ---------- */
export function validMoves(state) {
  const sc = SCENARIOS[state.sc];
  return MOVES.map((m) => {
    let ok = !state.ended && state.capital >= m.cost;
    let why = ok ? "" : state.ended ? "Game over" : "Not enough capital";
    if (ok && m.id === "summit" && state.talks) [ok, why] = [false, "Talks already convened"];
    if (ok && m.id === "summit" && eligibleForTalks(state).length < 3) [ok, why] = [false, "Needs 3 actors at trust 45+"];
    if (ok && m.id === "deal" && !state.talks) [ok, why] = [false, "Convene talks first"];
    if (ok && m.id === "guarantor" && state.guarantors.length >= Math.min(MAX_GUARANTORS, sc.guarantors.length)) [ok, why] = [false, "No more guarantors"];
    if (ok && m.id === "monitors" && state.monitors) [ok, why] = [false, "Monitors already deployed"];
    return { id: m.id, ok, why };
  });
}

function eligibleForTalks(state) {
  return Object.entries(state.actors).filter(([, a]) => !a.walked && a.trust >= 45).map(([id]) => id);
}

// Apply a move. `grade` is only used for back-channels: { tone: -2..2, addresses: [tags], crosses: bool, reply }.
export function applyMove(state, move, opts = {}, grade = null) {
  const sc = SCENARIOS[state.sc];
  const m = MOVES.find((x) => x.id === move);
  if (!m) return { error: "Unknown move." };
  const v = validMoves(state).find((x) => x.id === move);
  if (!v.ok) return { error: v.why };

  const target = opts.target && sc.actors.some((a) => a.id === opts.target) ? opts.target : null;
  if (m.target === true && !target) return { error: "Pick an actor." };
  if (m.target === true && state.actors[target].walked && move !== "listen") return { error: "That actor has walked out. Wait for them to come back." };
  if (move === "backchannel" && (state.pitched || []).includes(target)) return { error: "One back-channel per actor per turn." };

  const fx = sc.moveFx || {};
  const res = { move, events: [] };

  switch (move) {
    case "listen": {
      const a = state.actors[target];
      const key = CARD_ORDER.find((k) => a.cards[k] !== "known");
      if (!key) return { error: "You already know everything about this actor." };
      const def = actorDef(sc, target);
      const card = def.cards[key];
      const was = a.cards[key];
      a.cards[key] = "known";
      a.trust = clamp(a.trust + 2);
      const label = { red: "red line", goal: "real goal", flex: "flexibility" }[key];
      let text = `Listening to ${def.short}: their ${label} is now known.`;
      if (was === "recon") text += card.reconOk ? " The reconstruction was close." : " The reconstruction was wrong.";
      addLog(state, "intel", text, { actor: target, card: key, reconOk: was === "recon" ? !!card.reconOk : null });
      res.revealed = { actor: target, card: key, wasRecon: was === "recon", reconOk: card.reconOk };
      break;
    }
    case "backchannel": {
      const a = state.actors[target];
      const def = actorDef(sc, target);
      const g = normalizeGrade(grade);
      if (g.crosses) {
        a.trust = clamp(a.trust - 10);
        a.stance = clamp(a.stance - 5);
        if (a.cards.red !== "known") a.cards.red = "known";
        addLog(state, "backchannel", `${def.short} bristled: your message touched a red line.`, { actor: target, reply: g.reply, tone: -2 });
      } else {
        const hits = g.addresses.filter((t) => def.interests.includes(t)).length;
        const dt = Math.max(-10, Math.min(10, g.tone * 4 + Math.min(2, hits) * 2));
        const ds = Math.max(-5, Math.min(6, g.tone * 2 + (hits ? 1 : 0)));
        a.trust = clamp(a.trust + dt);
        a.stance = clamp(a.stance + ds);
        if (g.tone >= 2 && a.cards.flex !== "known") a.cards.flex = "known";
        if (g.tone >= 1) state.scores.resolution = clamp(state.scores.resolution + 2);
        addLog(state, "backchannel", `Back-channel with ${def.short}.`, { actor: target, reply: g.reply, tone: g.tone, dt });
      }
      state.pitched = (state.pitched || []).concat(target);
      res.grade = g;
      break;
    }
    case "aid": {
      const f = fx.aid || {};
      applyScores(state, f.scores || { humanitarian: -7 });
      applyActorDelta(state, "trust", f.trust);
      addLog(state, "move", `${f.label || "Humanitarian package"} delivered.`);
      break;
    }
    case "incentive": {
      const def = actorDef(sc, target);
      const a = state.actors[target];
      a.trust = clamp(a.trust + 12);
      a.stance = clamp(a.stance + 6);
      const jealous = sc.actors.filter((x) => x.rivals.includes(target) || def.rivals.includes(x.id)).map((x) => x.id);
      for (const id of jealous) state.actors[id].trust = clamp(state.actors[id].trust - 4);
      state.scores.economic = clamp(state.scores.economic - 2);
      addLog(state, "move", `Economic incentive to ${def.short}.` + (jealous.length ? ` ${jealous.map((id) => actorDef(sc, id).short).join(", ")} noticed.` : ""));
      break;
    }
    case "guarantor": {
      const g = sc.guarantors.find((x) => x.id === opts.guarantor && !state.guarantors.includes(x.id));
      if (!g) return { error: "Pick a guarantor." };
      state.guarantors.push(g.id);
      applyActorDelta(state, "trust", g.boost);
      for (const a of Object.values(state.actors)) a.stance = clamp(a.stance + 3);
      addLog(state, "move", `${g.name} joins as guarantor.`);
      break;
    }
    case "community": {
      const f = fx.community || {};
      applyScores(state, f.scores || { stability: -5 });
      applyActorDelta(state, "trust", f.trust);
      addLog(state, "move", `${f.label || "Community engagement"}.`);
      break;
    }
    case "monitors": {
      const f = opts.variant === "foreign" && fx.monitorsForeign ? fx.monitorsForeign : fx.monitors || {};
      const tags = f.tags || [];
      applyScores(state, f.scores || { intensity: -8 });
      applyActorDelta(state, "trust", f.trust);
      state.monitors = true;
      addLog(state, "move", `${f.label || "Monitors"} deployed.`);
      for (const def of sc.actors) {
        if (!state.actors[def.id].walked && crossesRedLine(def, tags)) walkOut(state, sc, def.id, "Monitors crossed a red line.");
      }
      break;
    }
    case "summit": {
      const who = eligibleForTalks(state);
      state.talks = true;
      state.scores.resolution = clamp(state.scores.resolution + 10);
      for (const id of who) state.actors[id].stance = clamp(state.actors[id].stance + 4);
      addLog(state, "move", `Talks convened with ${who.map((id) => actorDef(sc, id).short).join(", ")}.`);
      break;
    }
    case "deal": {
      const r = evaluateDeal(state, opts.clauses);
      if (r.error) return r;
      state.deals += 1;
      res.deal = r;
      for (const v of r.votes) {
        if (v.reason === "red_line") walkOut(state, sc, v.actor, "Your framework crossed their red line.");
        else if (!v.accept) state.actors[v.actor].stance = clamp(state.actors[v.actor].stance - 3);
        else state.actors[v.actor].stance = clamp(state.actors[v.actor].stance + 3);
      }
      const yes = r.votes.filter((x) => x.accept).length;
      if (r.passed) {
        state.scores.resolution = clamp(Math.max(state.scores.resolution + 30, 75));
        state.scores.intensity = clamp(state.scores.intensity - 15);
        state.scores.contagion = clamp(state.scores.contagion - 10);
        addLog(state, "deal", `Framework agreed by ${yes} of ${r.votes.length}.`, { votes: r.votes });
        state.capital -= m.cost;
        finish(state, "deal");
        res.ended = true;
        return res;
      }
      state.scores.resolution = clamp(state.scores.resolution + yes * 2);
      addLog(state, "deal", `Framework failed: ${yes} of ${r.votes.length} accepted.` + (r.vetoed.length ? ` Vetoed by ${r.vetoed.map((id) => actorDef(sc, id).short).join(", ")}.` : ""), { votes: r.votes });
      break;
    }
  }

  state.capital -= m.cost;
  state.scores.alignment = alignmentOf(state);
  return res;
}

function normalizeGrade(g) {
  g = g || {};
  const tone = Math.max(-2, Math.min(2, Math.round(Number(g.tone) || 0)));
  const addresses = Array.isArray(g.addresses) ? g.addresses.filter((t) => typeof t === "string").slice(0, 6) : [];
  return { tone, addresses, crosses: !!g.crosses, reply: typeof g.reply === "string" ? g.reply.slice(0, 600) : "", source: g.source || "" };
}

/* ---------- deals ---------- */
export function evaluateDeal(state, clauseIds) {
  const sc = SCENARIOS[state.sc];
  if (!Array.isArray(clauseIds)) return { error: "Pick clauses." };
  const ids = [...new Set(clauseIds)].filter((id) => sc.clauses.some((c) => c.id === id));
  if (ids.length < 1 || ids.length > 4) return { error: "Pick between 1 and 4 clauses." };
  const tags = ["deal", ...ids.flatMap((id) => sc.clauses.find((c) => c.id === id).tags)];
  const votes = sc.actors.map((def) => {
    const a = state.actors[def.id];
    if (a.walked) return { actor: def.id, accept: false, reason: "absent", value: null };
    if (crossesRedLine(def, tags)) return { actor: def.id, accept: false, reason: "red_line", value: null };
    const clauseValue = ids.reduce((s, id) => s + (def.weights[id] || 0), 0);
    const value = clauseValue + (a.trust - 50) / 12 + (a.stance - 50) / 12;
    const accept = value >= 3;
    return { actor: def.id, accept, reason: accept ? "accepts" : clauseValue < 1 ? "nothing_for_us" : "not_ready", value: +value.toFixed(1) };
  });
  const vetoed = sc.veto.filter((id) => !votes.find((v) => v.actor === id).accept);
  const yes = votes.filter((v) => v.accept).length;
  return { clauses: ids, votes, vetoed, passed: vetoed.length === 0 && yes >= 5 };
}

/* ---------- end of turn ---------- */
export function endTurn(state) {
  const sc = SCENARIOS[state.sc];
  if (state.ended) return { error: "Game over." };
  const out = { events: [] };

  // 1. A world event.
  const pool = sc.events.filter((e) => !state.used.includes(e.id));
  const ev = pool[Math.floor(rand(state) * pool.length)] || sc.events[Math.floor(rand(state) * sc.events.length)];
  state.used.push(ev.id);
  const blunted = ev.mitigatedBy === "monitors" && state.monitors;
  const f = blunted ? 0.4 : 1;
  applyScores(state, ev.scores, f);
  applyActorDelta(state, "trust", ev.trust, f);
  applyActorDelta(state, "stance", ev.stance, f);
  addLog(state, "event", ev.title + (blunted ? " Monitors limited the damage." : ""), { detail: ev.text });
  out.events.push({ title: ev.title, text: ev.text, blunted });

  // 2. Spillover from connected conflicts, weighted by the contagion score.
  for (const n of sc.neighbors) {
    const p = (state.scores.contagion / 100) * n.weight * 0.3;
    if (rand(state) < p) {
      const sp = sc.spill.find((s) => s.from === n.id);
      if (sp) {
        applyScores(state, sp.scores);
        applyActorDelta(state, "trust", sp.trust);
        applyActorDelta(state, "stance", sp.stance);
        addLog(state, "spill", `Spillover from ${n.name}: ${sp.title}`, { detail: sp.text });
        out.events.push({ title: sp.title, text: sp.text, spill: n.name });
        break;
      }
    }
  }

  // 3. Drift: open talks build momentum, high violence erodes trust, walkouts count down.
  if (state.talks) state.scores.resolution = clamp(state.scores.resolution + 2);
  if (state.scores.intensity >= 75) for (const a of Object.values(state.actors)) a.trust = clamp(a.trust - 2);
  for (const [id, a] of Object.entries(state.actors)) {
    if (a.walked) {
      a.walked -= 1;
      if (!a.walked) addLog(state, "return", `${actorDef(sc, id).short} is back at the table.`, { actor: id });
    }
  }
  state.scores.alignment = alignmentOf(state);

  // 4. Lose conditions, then the next turn.
  if (state.scores.intensity >= 95) {
    finish(state, "war");
  } else if (state.turn >= sc.turns) {
    finish(state, "timeout");
  } else {
    state.turn += 1;
    state.pitched = [];
    state.capital = CAPITAL_PER_TURN + Math.min(CAPITAL_CARRY, state.capital);
  }
  out.ended = state.ended;
  return out;
}

function finish(state, outcome) {
  state.ended = true;
  state.outcome = outcome;
  state.score = scoreOf(state);
  const msg = { deal: "A framework is signed.", war: "Violence spiraled out of control.", timeout: "Time ran out without a deal." }[outcome];
  addLog(state, "end", msg);
}

export function scoreOf(state) {
  let s = 0;
  for (const d of DIMENSIONS) {
    const delta = state.scores[d.id] - state.start[d.id];
    s += (d.lowerIsBetter ? -delta : delta) * 4;
  }
  if (state.outcome === "deal") s += 600 + (SCENARIOS[state.sc].turns - state.turn) * 50;
  if (state.outcome === "war") s -= 200;
  s -= state.walkouts * 25;
  return Math.max(0, Math.round(s));
}

/* ---------- views ---------- */
// What the player is allowed to see. Hidden truths never leave the server until the game ends.
export function publicView(state) {
  const sc = SCENARIOS[state.sc];
  const reveal = state.ended;
  return {
    sc: sc.id,
    turn: state.turn,
    turns: sc.turns,
    capital: state.capital,
    scores: state.scores,
    start: state.start,
    talks: state.talks,
    monitors: state.monitors,
    guarantors: state.guarantors,
    ended: state.ended,
    outcome: state.outcome,
    score: state.ended ? state.score : null,
    moves: validMoves(state),
    log: state.log.slice(-40),
    actors: sc.actors.map((def) => {
      const a = state.actors[def.id];
      const cards = {};
      for (const k of CARD_ORDER) {
        const st = reveal ? "known" : a.cards[k];
        const c = def.cards[k];
        cards[k] = {
          state: st,
          text: st === "known" ? c.truth : st === "recon" ? c.recon : null,
          wasRecon: reveal && !!c.recon && tierOf(def.coverage) !== "documented" && !(tierOf(def.coverage) === "partial" && k === "goal"),
          reconText: reveal ? c.recon || null : null,
          reconOk: reveal ? c.reconOk !== false : null,
        };
      }
      return {
        id: def.id,
        name: def.name,
        short: def.short,
        role: def.role,
        coverage: def.coverage,
        tier: tierOf(def.coverage),
        veto: sc.veto.includes(def.id),
        trust: a.trust,
        stance: a.stance,
        walked: a.walked,
        cards,
      };
    }),
  };
}

export function scenarioCatalog() {
  return Object.values(SCENARIOS).map((sc) => ({
    id: sc.id,
    name: sc.name,
    title: sc.title,
    blurb: sc.blurb,
    baseline: sc.baseline,
    turns: sc.turns,
    clauses: sc.clauses.map(({ id, name, text }) => ({ id, name, text })),
    guarantors: sc.guarantors.map(({ id, name, text }) => ({ id, name, text })),
    neighbors: sc.neighbors.map(({ name, weight }) => ({ name, weight })),
    monitorVariants: sc.moveFx && sc.moveFx.monitorsForeign
      ? [{ id: "local", name: sc.moveFx.monitors.label }, { id: "foreign", name: sc.moveFx.monitorsForeign.label }]
      : [{ id: "local", name: (sc.moveFx && sc.moveFx.monitors && sc.moveFx.monitors.label) || "Monitors" }],
    moveLabels: { aid: sc.moveFx?.aid?.label, community: sc.moveFx?.community?.label },
  }));
}

export { DIMENSIONS, MOVES };
