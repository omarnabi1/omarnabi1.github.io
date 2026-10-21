// EnvoyHub: one Durable Object that stores Envoy games, the per-scenario leaderboard, and the
// LLM budget. Games are keyed by a random id that acts as the player's capability token.

import { DurableObject } from "cloudflare:workers";
import { SCENARIOS, DIMENSIONS } from "./scenarios.js";
import { newGame, applyMove, endTurn, publicView, scenarioCatalog } from "./engine.js";
import { gradePitch, debrief } from "./llm.js";

const GAME_TTL_MS = 3 * 24 * 3600 * 1000;
const day = () => new Date().toISOString().slice(0, 10);

export class EnvoyHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, state TEXT NOT NULL, name TEXT, iph TEXT, at INTEGER NOT NULL, upd INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS games_upd ON games (upd)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS board (id INTEGER PRIMARY KEY, sc TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, outcome TEXT, turn INTEGER, at INTEGER NOT NULL, game TEXT)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS board_sc ON board (sc, score)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS budget (k TEXT PRIMARY KEY, n INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hits (iph TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS hits_iph ON hits (iph, kind, at)`);
  }

  /* ----- helpers ----- */
  load(id) {
    const row = this.sql.exec(`SELECT state, name FROM games WHERE id = ?`, id).toArray()[0];
    return row ? { state: JSON.parse(row.state), name: row.name } : null;
  }
  store(id, state) {
    this.sql.exec(`UPDATE games SET state = ?, upd = ? WHERE id = ?`, JSON.stringify(state), Date.now(), id);
  }
  limited(iph, kind, perHour) {
    const since = Date.now() - 3600 * 1000;
    const c = this.sql.exec(`SELECT COUNT(*) AS c FROM hits WHERE iph = ? AND kind = ? AND at > ?`, iph, kind, since).toArray()[0].c;
    if (c >= perHour) return true;
    this.sql.exec(`INSERT INTO hits (iph, kind, at) VALUES (?, ?, ?)`, iph, kind, Date.now());
    return false;
  }
  spend(kind, limit) {
    const k = `${day()}:${kind}`;
    const row = this.sql.exec(`SELECT n FROM budget WHERE k = ?`, k).toArray()[0];
    const n = row ? row.n : 0;
    if (n >= limit) return false;
    this.sql.exec(`INSERT OR REPLACE INTO budget (k, n) VALUES (?, ?)`, k, n + 1);
    return true;
  }
  llmEnv(kind) {
    // Returns the env to hand the LLM layer: without the key when today's budget is spent, so it falls back to scripted replies.
    const limits = { pitch: Number(this.env.ENVOY_DAILY_PITCHES || 1500), debrief: Number(this.env.ENVOY_DAILY_DEBRIEFS || 200) };
    if (!this.env.ANTHROPIC_API_KEY || !this.spend(kind, limits[kind])) return { ...this.env, ANTHROPIC_API_KEY: "" };
    return this.env;
  }

  /* ----- RPC ----- */
  catalog() {
    return { scenarios: scenarioCatalog(), dimensions: DIMENSIONS, live: !!this.env.ANTHROPIC_API_KEY };
  }

  create(scId, name, iph) {
    if (!SCENARIOS[scId]) return { error: "Unknown scenario." };
    if (this.limited(iph, "new", 30)) return { error: "Too many new games this hour. Take a breather." };
    this.sql.exec(`DELETE FROM games WHERE upd < ?`, Date.now() - GAME_TTL_MS);
    this.sql.exec(`DELETE FROM hits WHERE at < ?`, Date.now() - 3600 * 1000);
    const id = crypto.randomUUID().replace(/-/g, "");
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const state = newGame(scId, seed);
    this.sql.exec(`INSERT INTO games (id, state, name, iph, at, upd) VALUES (?, ?, ?, ?, ?, ?)`, id, JSON.stringify(state), name || "", iph, Date.now(), Date.now());
    return { id, view: publicView(state) };
  }

  view(id) {
    const g = this.load(id);
    if (!g) return { error: "Game not found. It may have expired." };
    return { view: publicView(g.state), debrief: g.state.debrief || null };
  }

  async move(id, body, iph) {
    const g = this.load(id);
    if (!g) return { error: "Game not found. It may have expired." };
    const { state } = g;
    const opts = { target: body.target, guarantor: body.guarantor, variant: body.variant, clauses: body.clauses };
    let grade = null;
    if (body.move === "backchannel") {
      const pitch = typeof body.pitch === "string" ? body.pitch.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 600) : "";
      if (pitch.split(/\s+/).filter(Boolean).length < 3) return { error: "Write a short message first (a sentence or two)." };
      const pre = applyMove(structuredClone(state), "backchannel", opts, { tone: 0 });
      if (pre.error) return pre;
      if (this.limited(iph, "pitch", 60)) return { error: "That's a lot of diplomacy for one hour. Try again soon." };
      grade = await gradePitch(this.llmEnv("pitch"), state, body.target, pitch);
    }
    const res = applyMove(state, body.move, opts, grade);
    if (res.error) return res;
    if (state.ended) await this.wrapUp(id, state, g.name);
    this.store(id, state);
    if (res.grade) res.grade = { tone: res.grade.tone, reply: res.grade.reply, crosses: res.grade.crosses, source: res.grade.source };
    return { view: publicView(state), res, debrief: state.debrief || null };
  }

  async endTurn(id) {
    const g = this.load(id);
    if (!g) return { error: "Game not found. It may have expired." };
    const out = endTurn(g.state);
    if (out.error) return out;
    if (g.state.ended) await this.wrapUp(id, g.state, g.name);
    this.store(id, g.state);
    return { view: publicView(g.state), out, debrief: g.state.debrief || null };
  }

  async wrapUp(id, state, name) {
    if (state.recorded) return;
    state.recorded = true;
    const nm = (name || "").trim();
    if (nm) {
      this.sql.exec(`INSERT INTO board (sc, name, score, outcome, turn, at, game) VALUES (?, ?, ?, ?, ?, ?, ?)`, state.sc, nm, state.score, state.outcome, state.turn, Date.now(), id);
    }
    const sc = SCENARIOS[state.sc];
    const v = publicView(state);
    const summary = {
      conflict: sc.name,
      outcome: state.outcome,
      turn: state.turn,
      score: state.score,
      scores_start: state.start,
      scores_end: state.scores,
      walkouts: state.walkouts,
      log: state.log.map((l) => `T${l.t} ${l.kind}: ${l.text}`).slice(-30),
      actors: v.actors.map((a) => ({ actor: a.name, trust: a.trust, readiness: a.stance, real_goal: a.cards.goal.text, red_line: a.cards.red.text, flexibility: a.cards.flex.text, reconstruction_was_wrong: Object.entries(a.cards).filter(([, c]) => c.wasRecon && c.reconOk === false).map(([k]) => k) })),
    };
    state.debrief = (await debrief(this.llmEnv("debrief"), summary)) || scriptedDebrief(state, v);
  }

  board(scId) {
    if (!SCENARIOS[scId]) return { rows: [] };
    const rows = this.sql
      .exec(`SELECT name AS n, MAX(score) AS s, outcome AS o FROM board WHERE sc = ? GROUP BY lower(name) ORDER BY s DESC LIMIT 15`, scId)
      .toArray()
      .map((r) => ({ n: r.n, s: r.s, o: r.o }));
    const stats = this.sql.exec(`SELECT COUNT(*) AS games, SUM(CASE WHEN outcome = 'deal' THEN 1 ELSE 0 END) AS deals FROM board WHERE sc = ?`, scId).toArray()[0] || {};
    return { rows, games: stats.games || 0, deals: stats.deals || 0 };
  }
}

function scriptedDebrief(state, v) {
  const NAMES = { red: "red line", goal: "real goal", flex: "flexibility" };
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
  const wrong = v.actors
    .map((a) => ({ a, ks: Object.entries(a.cards).filter(([, c]) => c.wasRecon && c.reconOk === false).map(([k]) => NAMES[k]) }))
    .filter((x) => x.ks.length)
    .map((x) => `${x.a.short}'s ${list(x.ks)}`);
  const head = { deal: "You got a framework signed.", war: "The conflict escalated past the point of talks.", timeout: "The clock ran out before a deal." }[state.outcome];
  const low = v.actors.slice().sort((a, b) => a.trust - b.trust)[0];
  return [
    `${head} Final score ${state.score}.`,
    wrong.length ? `Thin sources hid the truth about ${list(wrong)}: the reconstruction CR-AI started with was wrong. Quiet listening would have shown it.` : "Every reconstruction you relied on turned out close to the truth.",
    `The party that trusted you least was ${low.short} (${low.trust}/100). Earlier back-channels aimed at what they actually want would have changed the vote.`,
  ].join("\n\n");
}
