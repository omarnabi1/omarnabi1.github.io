// omarnabi.com: one Worker serves the static site, the live layer, the leaderboard,
// visit history for the owner, phone alerts, and a first-party analytics proxy.
import { DurableObject } from "cloudflare:workers";
export { EnvoyHub } from "./envoy/hub.js";

/* ---------- shared constants ---------- */
const GAME = {
  // Outcomes and CR-AI forecasts for the five Beat my AI questions (must match public/index.html).
  outcomes: [0, 0, 1, 1, 1],
  crai: [0.38, 0.27, 0.61, 0.72, 0.66],
};
const CRAI_BRIER = brier(GAME.crai, GAME.outcomes);
const MAX_SOCKETS = 250;
const MAX_VISITS = 2000;
const NOTIFY_RULES = [
  { match: "copied your email", title: "Someone copied your email", tags: "email" },
  { match: "built a plan", title: "Someone built a plan for their team", tags: "clipboard" },
  { match: "sudo hire omar", title: "sudo hire omar", tags: "computer" },
  { match: "beat CR-AI", title: "Someone beat CR-AI", tags: "trophy" },
];

function brier(ps, os) {
  return ps.reduce((s, p, i) => s + (p - os[i]) * (p - os[i]), 0) / ps.length;
}

/* ---------- small helpers ---------- */
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

const CTRL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g;
function cleanText(v, max) {
  if (typeof v !== "string") return null;
  const s = v.replace(CTRL, "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}
function cleanId(v) {
  return typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : null;
}
function num(v, lo, hi) {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;
}
function looksLikeOmar(name) {
  return /\bomar\b|nabi|\bowner\b|\badmin\b/i.test(name);
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
async function ipHash(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  return (await sha256(ip + "|" + (env.IP_SALT || env.OWNER_KEY || "omarnabi"))).slice(0, 20);
}

let regionNames = null;
function countryName(code) {
  if (!code) return "";
  try {
    regionNames = regionNames || new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}
function deviceOf(ua) {
  ua = ua || "";
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Mac OS X|Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}

function originAllowed(req, env) {
  const origin = req.headers.get("Origin");
  if (!origin) return true; // non-browser clients (curl, tests)
  try {
    const o = new URL(origin);
    const here = new URL(req.url);
    if (o.host === here.host) return true;
    const extra = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    return extra.includes(o.origin);
  } catch {
    return false;
  }
}

const lobby = (env) => env.LOBBY.get(env.LOBBY.idFromName("main"));
const envoy = (env) => env.ENVOY.get(env.ENVOY.idFromName("main"));

async function readJson(req, max = 4000) {
  const body = await req.text();
  if (body.length > max) return { error: "too large" };
  try {
    const d = JSON.parse(body);
    return d && typeof d === "object" ? d : { error: "bad json" };
  } catch {
    return { error: "bad json" };
  }
}

/* ---------- Envoy: the CR-AI world-map strategy game ---------- */
async function envoyApi(req, env, ctx, url, path) {
  const hub = envoy(env);
  const gid = (v) => (typeof v === "string" && /^[a-f0-9]{32}$/.test(v) ? v : null);
  const cid = (v) => (typeof v === "string" && /^[a-z0-9]{1,24}$/.test(v) ? v : null);
  if (path === "/api/envoy/catalog" && req.method === "GET") return json(await hub.catalog(), 200, { "cache-control": "public, max-age=20" });
  if (path === "/api/envoy/leaderboard" && req.method === "GET") {
    const c = cid(url.searchParams.get("c"));
    return json(c ? await hub.board(c) : { rows: [] }, 200, { "cache-control": "public, max-age=15" });
  }
  if (path === "/api/envoy/game" && req.method === "GET") {
    const id = gid(url.searchParams.get("id"));
    if (!id) return json({ error: "bad id" }, 400);
    const r = await hub.get(id);
    return json(r, r.error ? 404 : 200);
  }
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  if (!originAllowed(req, env)) return json({ error: "forbidden" }, 403);
  const d = await readJson(req);
  if (d.error) return json(d, 400);
  const iph = await ipHash(req, env);
  if (path === "/api/envoy/build") {
    const r = await hub.build(typeof d.prompt === "string" ? d.prompt : "", iph);
    return json(r, r.error ? 400 : 200);
  }
  if (path === "/api/envoy/new") {
    let name = cleanText(d.name, 20) || "";
    if (name && looksLikeOmar(name)) name = "Visitor";
    const r = await hub.create(cid(d.c) || "", cleanId(d.twist) || "asis", name, iph);
    return json(r, r.error ? 400 : 200);
  }
  if (path === "/api/envoy/move") {
    const id = gid(d.id);
    if (!id) return json({ error: "bad id" }, 400);
    const body = {
      a: cleanId(d.a),
      hs: cleanId(d.hs),
      party: cleanId(d.party),
      clause: cleanId(d.clause),
      clauses: Array.isArray(d.clauses) ? d.clauses.filter((c) => cleanId(c)).slice(0, 3) : undefined,
      choice: d.choice === 1 ? 1 : 0,
      text: typeof d.text === "string" ? d.text.slice(0, 400) : "",
    };
    const r = await hub.move(id, body, iph);
    if (r.view && r.view.ended && r.view.outcome === "win" && body.a !== "end") {
      ctx.waitUntil(lobby(env).notify("Someone won Envoy", `${r.view.title}: score ${r.view.score}.`, "dove").catch(() => {}));
    }
    return json(r, r.error ? 400 : 200);
  }
  return json({ error: "not found" }, 404);
}

/* ---------- PostHog reverse proxy (first-party, so ad blockers don't drop it) ---------- */
async function posthogProxy(req, env, url) {
  const region = env.POSTHOG_REGION === "eu" ? "eu" : "us";
  const isStatic = url.pathname.startsWith("/ingest/static/");
  const host = isStatic ? `${region}-assets.i.posthog.com` : `${region}.i.posthog.com`;
  const target = new URL(url.pathname.replace(/^\/ingest/, "") + url.search, `https://${host}`);
  const headers = new Headers(req.headers);
  headers.delete("cookie");
  headers.delete("host");
  const ip = req.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Forwarded-For", ip);
  const init = {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    redirect: "follow",
  };
  if (isStatic) init.cf = { cacheEverything: true, cacheTtl: 3600 };
  const res = await fetch(target, init);
  const out = new Response(res.body, res);
  out.headers.delete("set-cookie");
  return out;
}

/* ---------- Worker entry ---------- */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/live") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      if (!originAllowed(req, env)) return new Response("Forbidden", { status: 403 });
      const cf = req.cf || {};
      const headers = new Headers(req.headers);
      headers.set(
        "x-visitor",
        JSON.stringify({
          city: cf.city || "",
          region: cf.regionCode || cf.region || "",
          country: countryName(cf.country || ""),
          org: cf.asOrganization || "",
          dev: deviceOf(req.headers.get("User-Agent")),
          iph: await ipHash(req, env),
        })
      );
      return lobby(env).fetch(new Request(req, { headers }));
    }

    if (path.startsWith("/ingest/") || path === "/ingest") return posthogProxy(req, env, url);

    if (path === "/api/health") return json({ ok: true });

    if (path === "/api/leaderboard" && req.method === "GET") {
      return json(await lobby(env).leaderboard(), 200, { "cache-control": "public, max-age=15" });
    }

    if (path === "/api/score" && req.method === "POST") {
      if (!originAllowed(req, env)) return json({ error: "forbidden" }, 403);
      const body = await req.text();
      if (body.length > 2000) return json({ error: "too large" }, 413);
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const r = await lobby(env).submitScore(data && data.name, data && data.picks, await ipHash(req, env));
      return json(r, r.error ? 400 : 200);
    }

    if (path === "/api/history" && req.method === "GET") {
      if (!(await safeEqual(req.headers.get("x-owner-key") || "", env.OWNER_KEY || ""))) return json({ error: "unauthorized" }, 401);
      return json({ rows: await lobby(env).history(Number(url.searchParams.get("limit")) || 100) });
    }

    if (path.startsWith("/api/envoy/")) return envoyApi(req, env, ctx, url, path);

    if (path.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(req);
  },
};

/* ---------- The Lobby: one room for everyone on the site ---------- */
export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY, name TEXT NOT NULL, brier REAL NOT NULL, at INTEGER NOT NULL, iph TEXT)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS scores_iph ON scores (iph, at)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, city TEXT, region TEXT, country TEXT, org TEXT, dev TEXT, ref TEXT, at INTEGER, secs INTEGER, acts TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bans (iph TEXT PRIMARY KEY, until INTEGER NOT NULL)`);
    // Keepalive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
    this.buckets = new Map(); // per-socket rate limits (in memory; reset on hibernation is fine)
    this.closed = new Set();
    this.pushLog = [];
  }

  /* ----- connections ----- */
  async fetch(req) {
    let v = {};
    try {
      v = JSON.parse(req.headers.get("x-visitor") || "{}");
    } catch {}
    if (v.iph && this.isBanned(v.iph)) return new Response("Banned", { status: 403 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response("Full", { status: 503 });

    const [client, server] = Object.values(new WebSocketPair());
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({
      id,
      ready: false,
      own: false,
      city: String(v.city || "").slice(0, 60),
      region: String(v.region || "").slice(0, 40),
      country: String(v.country || "").slice(0, 60),
      org: String(v.org || "").slice(0, 80),
      dev: String(v.dev || "").slice(0, 20),
      iph: String(v.iph || ""),
      ref: "",
      at: Date.now(),
      p: {},
      acts: [],
      fired: [],
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 4000) return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const a = ws.deserializeAttachment();
    if (!a || !m || typeof m !== "object") return;
    if (!this.allow(a.id, m.type === "p" ? 1 : 3)) return;

    if (m.type === "hello" && !a.ready) {
      a.own = await safeEqual(typeof m.key === "string" ? m.key : "", this.env.OWNER_KEY || "");
      a.ref = cleanRef(m.ref);
      a.ready = true;
      a.at = Date.now();
      a.p = {};
      this.applyPatch(a, Object.assign({ nm: "" }, m.p || {}));
      if (a.own) a.p.own = true;
      this.save(ws, a);
      const others = this.readySockets().filter((s) => s !== ws);
      ws.send(
        JSON.stringify({
          type: "init",
          you: a.id,
          owner: a.own,
          peers: others.map((s) => this.view(s.deserializeAttachment(), a.own)),
        })
      );
      this.broadcast(ws, (forOwner) => ({ type: "join", peer: this.view(a, forOwner) }));
      if (!a.own && this.env.NOTIFY_JOINS === "1") {
        this.notify("New visitor", `${who(a)} just opened the site${a.ref ? " via " + a.ref : ""}.`, "wave");
      }
      return;
    }

    if (!a.ready) return;

    if (m.type === "p" && m.d && typeof m.d === "object") {
      const d = this.applyPatch(a, m.d);
      if (!d) return;
      this.save(ws, a);
      this.broadcast(ws, (forOwner) => ({ type: "upd", peer: a.id, d: forOwner ? d : publicPatch(d) }));
      return;
    }

    if (m.type === "kick" && a.own) {
      const id = cleanId(m.peer);
      if (!id) return;
      for (const s of this.ctx.getWebSockets(id)) {
        const t = s.deserializeAttachment();
        if (t && !t.own) {
          if (t.iph) this.sql.exec(`INSERT OR REPLACE INTO bans (iph, until) VALUES (?, ?)`, t.iph, Date.now() + 24 * 3600 * 1000);
          try {
            s.close(4003, "Removed by the site owner");
          } catch {}
          this.depart(s, t);
        }
      }
    }
  }

  async webSocketClose(ws, code) {
    this.depart(ws, ws.deserializeAttachment());
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {}
  }

  async webSocketError(ws) {
    this.depart(ws, ws.deserializeAttachment());
  }

  depart(ws, a) {
    if (!a || this.closed.has(a.id)) return;
    this.closed.add(a.id);
    if (this.closed.size > 5000) this.closed.clear();
    this.buckets.delete(a.id);
    if (!a.ready) return;
    this.broadcast(ws, () => ({ type: "leave", peer: a.id }));
    const secs = Math.round((Date.now() - a.at) / 1000);
    if (!a.own && secs >= 3) {
      this.sql.exec(
        `INSERT INTO visits (city, region, country, org, dev, ref, at, secs, acts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.city, a.region, a.country, a.org, a.dev, a.ref, a.at, secs, JSON.stringify(a.acts || [])
      );
      this.sql.exec(`DELETE FROM visits WHERE id <= (SELECT id FROM visits ORDER BY id DESC LIMIT 1 OFFSET ?)`, MAX_VISITS);
    }
  }

  /* ----- presence ----- */
  applyPatch(a, raw) {
    const d = {};
    const now = Date.now();
    if ("nm" in raw) {
      let nm = cleanText(raw.nm, 24);
      if (a.own) nm = "Omar";
      else if (!nm || looksLikeOmar(nm)) nm = "Visitor";
      d.nm = nm;
    }
    if ("col" in raw && typeof raw.col === "string" && /^#[0-9a-f]{6}$/i.test(raw.col)) d.col = raw.col;
    if ("t" in raw) {
      const t = cleanId(raw.t);
      const rx = num(raw.rx, -0.5, 1.5);
      const ry = num(raw.ry, -0.5, 1.5);
      if (t && rx !== null && ry !== null) Object.assign(d, { t, rx: +rx.toFixed(4), ry: +ry.toFixed(4) });
    }
    if ("v" in raw) {
      const v = cleanId(raw.v);
      if (v) d.v = v;
    }
    if (raw.act && typeof raw.act === "object") {
      const s = cleanText(raw.act.s, 120);
      if (s) {
        d.act = { s, t: now };
        if (raw.act.priv) d.act.priv = true;
        a.acts = (a.acts || []).concat(s.slice(0, 70)).slice(-8);
        this.maybeNotifyAct(a, s);
      }
    }
    if ("msg" in raw && this.allow(a.id + ":chat", 1, 4, 0.5)) {
      const msg = cleanText(raw.msg, 80);
      if (msg) {
        d.msg = msg.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]");
        d.mt = now;
      }
    }
    if (raw.rxn && typeof raw.rxn === "object" && this.allow(a.id + ":rxn", 1, 6, 1.5)) {
      const e = cleanText(raw.rxn.e, 8);
      if (e) {
        d.rxn = { e, t: now };
        const at = raw.rxn.at;
        if (at && typeof at === "object" && cleanId(at.t) && num(at.rx, -0.5, 1.5) !== null && num(at.ry, -0.5, 1.5) !== null) {
          d.rxn.at = { t: at.t, rx: num(at.rx, -0.5, 1.5), ry: num(at.ry, -0.5, 1.5) };
        }
      }
    }
    if ("wave" in raw && !a.own && this.allow(a.id + ":wave", 1, 1, 1 / 30)) {
      d.wave = now;
      const owner = this.readySockets().some((s) => (s.deserializeAttachment() || {}).own);
      if (!owner) this.notify("Someone waved at you", `${who(a)} waved from the site.`, "wave");
    }
    if (!Object.keys(d).length) return null;
    Object.assign(a.p, d);
    if (a.own) a.p.own = true; // only the server can mark the owner
    else delete a.p.own;
    return d;
  }

  view(a, forOwner) {
    const share = this.env.SHARE_CITY !== "0" && !a.own;
    const v = {
      peer: a.id,
      presence: forOwner ? a.p : publicPatch(a.p),
      city: share || forOwner ? a.city : "",
      country: share || forOwner ? a.country : "",
      at: a.at,
    };
    if (forOwner && !a.own) Object.assign(v, { ref: a.ref, org: a.org, dev: a.dev, region: a.region });
    return v;
  }

  readySockets() {
    return this.ctx.getWebSockets().filter((s) => {
      const a = s.deserializeAttachment();
      return a && a.ready && !this.closed.has(a.id);
    });
  }

  broadcast(from, build) {
    let pub = null;
    let own = null;
    for (const s of this.readySockets()) {
      if (s === from) continue;
      const forOwner = !!s.deserializeAttachment().own;
      const msg = forOwner ? (own = own || JSON.stringify(build(true))) : (pub = pub || JSON.stringify(build(false)));
      try {
        s.send(msg);
      } catch {}
    }
  }

  save(ws, a) {
    // Attachments are capped at 2 KB; trim the activity log if needed.
    let s = JSON.stringify(a);
    while (s.length > 1900 && a.acts.length) {
      a.acts.shift();
      s = JSON.stringify(a);
    }
    if (s.length > 1990) {
      a.p = { nm: a.p.nm, col: a.p.col, own: a.p.own };
    }
    ws.serializeAttachment(a);
  }

  /* Token bucket: `cost` per call, `burst` capacity, `rate` tokens per second. */
  allow(key, cost = 1, burst = 40, rate = 25) {
    const now = Date.now();
    const b = this.buckets.get(key) || { t: burst, at: now };
    b.t = Math.min(burst, b.t + ((now - b.at) / 1000) * rate);
    b.at = now;
    if (b.t < cost) {
      this.buckets.set(key, b);
      return false;
    }
    b.t -= cost;
    this.buckets.set(key, b);
    return true;
  }

  isBanned(iph) {
    const row = this.sql.exec(`SELECT until FROM bans WHERE iph = ?`, iph).toArray()[0];
    return !!(row && row.until > Date.now());
  }

  /* ----- phone alerts via ntfy ----- */
  maybeNotifyAct(a, s) {
    if (a.own) return;
    const rule = NOTIFY_RULES.find((r) => s.includes(r.match));
    if (!rule || (a.fired || []).includes(rule.match)) return;
    a.fired = (a.fired || []).concat(rule.match).slice(-6);
    this.notify(rule.title, `${who(a)}: ${s}.`, rule.tags);
  }

  notify(title, body, tags) {
    const topic = this.env.NTFY_TOPIC;
    if (!topic) return;
    const now = Date.now();
    this.pushLog = this.pushLog.filter((t) => now - t < 3600 * 1000);
    if (this.pushLog.length >= 30) return;
    this.pushLog.push(now);
    const server = (this.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
    const headers = { Title: title.replace(/[^\x20-\x7e]/g, ""), Tags: tags || "", Click: this.env.SITE_URL || "" };
    if (this.env.NTFY_TOKEN) headers.Authorization = "Bearer " + this.env.NTFY_TOKEN;
    this.ctx.waitUntil(fetch(`${server}/${encodeURIComponent(topic)}`, { method: "POST", body, headers }).catch(() => {}));
  }

  /* ----- RPC: leaderboard, scores, history ----- */
  leaderboard() {
    const rows = this.sql
      .exec(`SELECT name AS n, MIN(brier) AS b FROM scores GROUP BY lower(name) ORDER BY b ASC LIMIT 15`)
      .toArray()
      .map((r) => ({ n: r.n, b: +(+r.b).toFixed(4) }));
    const stats = this.sql
      .exec(
        `SELECT COUNT(*) AS players, SUM(CASE WHEN b < ? THEN 1 ELSE 0 END) AS beating FROM (SELECT MIN(brier) AS b FROM scores GROUP BY lower(name))`,
        CRAI_BRIER
      )
      .toArray()[0] || { players: 0, beating: 0 };
    return { rows, players: stats.players || 0, beating: stats.beating || 0, crai: +CRAI_BRIER.toFixed(4) };
  }

  submitScore(name, picks, iph) {
    let n = cleanText(name, 20);
    if (!n || /^you$/i.test(n)) return { error: "Add a name to join the leaderboard." };
    if (looksLikeOmar(n)) n = "Visitor";
    if (!Array.isArray(picks) || picks.length !== GAME.outcomes.length) return { error: "Bad picks." };
    if (picks.some((p) => typeof p !== "number" || !(p >= 0.01 && p <= 0.99))) return { error: "Bad picks." };
    const ps = picks.map((p) => Math.round(p * 100) / 100);
    const hour = Date.now() - 3600 * 1000;
    const recent = this.sql.exec(`SELECT COUNT(*) AS c FROM scores WHERE iph = ? AND at > ?`, iph, hour).toArray()[0].c;
    if (recent >= 12) return { error: "Too many games in an hour. Take a breather." };
    const b = brier(ps, GAME.outcomes);
    this.sql.exec(`INSERT INTO scores (name, brier, at, iph) VALUES (?, ?, ?, ?)`, n, b, Date.now(), iph);
    const better = this.sql
      .exec(`SELECT COUNT(*) AS c FROM (SELECT MIN(brier) AS b FROM scores GROUP BY lower(name)) WHERE b < ?`, b)
      .toArray()[0].c;
    return { ok: true, name: n, brier: +b.toFixed(4), rank: better + 1, beatCrai: b < CRAI_BRIER };
  }

  history(limit = 100) {
    const n = Math.max(1, Math.min(500, limit | 0));
    return this.sql
      .exec(`SELECT city, region, country, org, dev, ref, at, secs, acts FROM visits ORDER BY id DESC LIMIT ?`, n)
      .toArray();
  }
}

function publicPatch(p) {
  if (!p || !p.act || !p.act.priv) return p;
  const { act, ...rest } = p;
  return rest;
}
function cleanRef(v) {
  const s = cleanText(v, 80);
  return s ? s.replace(/[^\w.:/ -]/g, "").slice(0, 60) : "";
}
function who(a) {
  const place = [a.city, a.country].filter(Boolean).join(", ");
  const name = (a.p && a.p.nm) || "A visitor";
  return `${name}${place ? " from " + place : ""}${a.org ? " (" + a.org + ")" : ""}${a.dev ? " on " + a.dev : ""}`;
}
