// EnvoyHub: one Durable Object holding Envoy games, campaigns built by players, the leaderboard,
// and the daily AI budget. Game ids are random and act as the player's capability token.

import { DurableObject } from "cloudflare:workers";
import { CAMPAIGN_BY_ID } from "./campaigns.js";
import { newGame, act, endMonth, resolveCrisis, view, catalog, summaryOf, campaignOf } from "./engine.js";
import { readMessage, buildCampaign } from "./llm.js";

const GAME_TTL_MS = 7 * 24 * 3600 * 1000;
const day = () => new Date().toISOString().slice(0, 10);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export class EnvoyHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // v1 tables are kept as-is; v2 uses its own.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS g2 (id TEXT PRIMARY KEY, state TEXT NOT NULL, name TEXT, iph TEXT, at INTEGER NOT NULL, upd INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS g2_upd ON g2 (upd)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS custom (k TEXT PRIMARY KEY, id TEXT NOT NULL, camp TEXT NOT NULL, prompt TEXT, at INTEGER NOT NULL, plays INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS board2 (id INTEGER PRIMARY KEY, c TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, outcome TEXT, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS board2_c ON board2 (c, score)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS budget (k TEXT PRIMARY KEY, n INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hits (iph TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS hits_iph ON hits (iph, kind, at)`);
  }

  /* ----- helpers ----- */
  load(id) {
    const row = this.sql.exec(`SELECT state, name FROM g2 WHERE id = ?`, id).toArray()[0];
    return row ? { st: JSON.parse(row.state), name: row.name } : null;
  }
  save(id, st) {
    this.sql.exec(`UPDATE g2 SET state = ?, upd = ? WHERE id = ?`, JSON.stringify(st), Date.now(), id);
  }
  limited(iph, kind, perHour) {
    const since = Date.now() - 3600 * 1000;
    const c = this.sql.exec(`SELECT COUNT(*) AS c FROM hits WHERE iph = ? AND kind = ? AND at > ?`, iph, kind, since).toArray()[0].c;
    if (c >= perHour) return true;
    this.sql.exec(`INSERT INTO hits (iph, kind, at) VALUES (?, ?, ?)`, iph, kind, Date.now());
    return false;
  }
  // Daily caps keep Workers AI inside its free allocation (10,000 neurons/day).
  spend(kind) {
    const limits = { msg: Number(this.env.ENVOY_DAILY_MESSAGES || 250), build: Number(this.env.ENVOY_DAILY_BUILDS || 8) };
    const k = `${day()}:${kind}`;
    const n = (this.sql.exec(`SELECT n FROM budget WHERE k = ?`, k).toArray()[0] || {}).n || 0;
    if (n >= limits[kind]) return false;
    this.sql.exec(`INSERT OR REPLACE INTO budget (k, n) VALUES (?, ?)`, k, n + 1);
    return true;
  }
  envWithAI(kind) {
    return this.env.AI && this.spend(kind) ? this.env : { ...this.env, AI: null };
  }
  customById(id) {
    const row = this.sql.exec(`SELECT camp FROM custom WHERE id = ?`, id).toArray()[0];
    return row ? JSON.parse(row.camp) : null;
  }

  /* ----- RPC ----- */
  catalog() {
    const built = this.sql.exec(`SELECT camp, prompt, plays FROM custom ORDER BY plays DESC, at DESC LIMIT 8`).toArray().map((r) => ({ ...summaryOf(JSON.parse(r.camp)), prompt: r.prompt, plays: r.plays }));
    const left = Number(this.env.ENVOY_DAILY_BUILDS || 8) - ((this.sql.exec(`SELECT n FROM budget WHERE k = ?`, `${day()}:build`).toArray()[0] || {}).n || 0);
    return { campaigns: catalog(), built, ai: !!this.env.AI, buildsLeft: this.env.AI ? Math.max(0, left) : 0 };
  }

  async build(prompt, iph) {
    const p = String(prompt || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
    if (p.split(/\s+/).filter(Boolean).length < 1 || p.length < 3) return { error: "Name a conflict, like “Cuban Missile Crisis” or “Water war on the Nile, 2040”." };
    const k = norm(p);
    const hit = this.sql.exec(`SELECT camp FROM custom WHERE k = ?`, k).toArray()[0];
    if (hit) return { campaign: summaryOf(JSON.parse(hit.camp)), cached: true };
    if (this.limited(iph, "build", 4)) return { error: "You've built a lot this hour. Play one of them, or try again later." };
    if (!this.env.AI) return { error: "Live building is offline right now. Try a curated world." };
    const env = this.envWithAI("build");
    if (!env.AI) return { error: "CR-AI has built all the new scenarios it can today. Pick one below, or come back tomorrow." };
    const camp = await buildCampaign(env, p);
    if (camp.error) return camp;
    camp.id = "x" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    this.sql.exec(`INSERT OR REPLACE INTO custom (k, id, camp, prompt, at, plays) VALUES (?, ?, ?, ?, ?, 0)`, k, camp.id, JSON.stringify(camp), p, Date.now());
    return { campaign: summaryOf(camp) };
  }

  create(campId, twist, name, iph) {
    const custom = CAMPAIGN_BY_ID[campId] ? null : this.customById(campId);
    if (!CAMPAIGN_BY_ID[campId] && !custom) return { error: "Unknown scenario." };
    if (this.limited(iph, "new", 40)) return { error: "Too many new games this hour." };
    this.sql.exec(`DELETE FROM g2 WHERE upd < ?`, Date.now() - GAME_TTL_MS);
    this.sql.exec(`DELETE FROM hits WHERE at < ?`, Date.now() - 3600 * 1000);
    if (custom) this.sql.exec(`UPDATE custom SET plays = plays + 1 WHERE id = ?`, campId);
    const id = crypto.randomUUID().replace(/-/g, "");
    const st = newGame(campId, crypto.getRandomValues(new Uint32Array(1))[0], twist, custom || undefined);
    this.sql.exec(`INSERT INTO g2 (id, state, name, iph, at, upd) VALUES (?, ?, ?, ?, ?, ?)`, id, JSON.stringify(st), name || "", iph, Date.now(), Date.now());
    return { id, view: view(st) };
  }

  get(id) {
    const g = this.load(id);
    return g ? { view: view(g.st) } : { error: "Game not found. It may have expired." };
  }

  async move(id, body, iph) {
    const g = this.load(id);
    if (!g) return { error: "Game not found. It may have expired." };
    const { st } = g;
    let res;
    if (body.a === "crisis") res = resolveCrisis(st, body.choice);
    else if (body.a === "end") res = endMonth(st);
    else {
      let ai = null;
      if (body.a === "message" && body.text) {
        const text = String(body.text).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 400);
        const camp = campaignOf(st);
        const H = camp.hotspots.find((h) => h.id === body.hs);
        const p = H && H.parties.find((x) => x.id === body.party);
        if (!H || !p) return { error: "Pick a party." };
        if (text.split(/\s+/).length < 3) return { error: "Write a sentence or two, or pick an offer." };
        const pre = act(structuredClone(st), "message", body.hs, { party: body.party }, { clauses: [], tone: 0 });
        if (pre.error) return pre;
        if (this.limited(iph, "msg", 60)) return { error: "Lots of diplomacy this hour. Use the offer chips for now." };
        ai = await readMessage(this.envWithAI("msg"), camp, H, p, text);
      }
      res = act(st, body.a, body.hs, { party: body.party, clause: body.clause, clauses: body.clauses }, ai);
    }
    if (res.error) return res;
    if (st.ended && !st.recorded) {
      st.recorded = true;
      if (g.name) this.sql.exec(`INSERT INTO board2 (c, name, score, outcome, at) VALUES (?, ?, ?, ?, ?)`, st.c, g.name, st.score, st.outcome, Date.now());
    }
    this.save(id, st);
    return { view: view(st), res };
  }

  board(c) {
    const rows = this.sql
      .exec(`SELECT name AS n, MAX(score) AS s, outcome AS o FROM board2 WHERE c = ? GROUP BY lower(name) ORDER BY s DESC LIMIT 10`, c)
      .toArray()
      .map((r) => ({ n: r.n, s: r.s, o: r.o }));
    const stats = this.sql.exec(`SELECT COUNT(*) AS games, SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins FROM board2 WHERE c = ?`, c).toArray()[0] || {};
    return { rows, games: stats.games || 0, wins: stats.wins || 0 };
  }
}
