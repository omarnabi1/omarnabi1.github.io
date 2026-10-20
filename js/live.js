/* Live layer client: connects to /live and exposes window.siteLive, the same
   room-style API the page uses (presence, peers, onPeers, isOwner, history, kick). */
(function () {
  "use strict";
  if (window.claude && typeof window.claude.use === "function") return;
  if (!("WebSocket" in window) || !window.Promise) return;

  /* Owner key: visit https://omarnabi.com/#owner=YOUR_KEY once on each device.
     #owner=off forgets it. The key lives only in this browser. */
  var KEY_LS = "on-owner-key", key = null;
  try {
    var hm = /[#&]owner=([^&]+)/.exec(location.hash);
    if (hm) {
      var hv = decodeURIComponent(hm[1]);
      if (hv === "off") localStorage.removeItem(KEY_LS); else localStorage.setItem(KEY_LS, hv);
      history.replaceState(null, "", location.pathname + location.search);
    }
    key = localStorage.getItem(KEY_LS);
  } catch (e) {}

  function referrer() {
    var out = "";
    try {
      var q = new URLSearchParams(location.search), src = q.get("utm_source") || q.get("ref") || q.get("source");
      if (src) out = src;
      else if (document.referrer) {
        var h = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (h && h !== location.hostname.replace(/^www\./, "")) out = h;
      }
    } catch (e) {}
    return out.slice(0, 60);
  }

  var peers = {}, meId = null, owner = false, mine = {}, pending = null, ws = null;
  var handlers = [], errHandlers = [], sendTimer = 0, lastSend = 0, tries = 0, dead = false, everConnected = false;
  var queue = { joined: [], left: [], updated: [] }, emitQueued = false, hiddenTimer = 0, pingTimer = 0, resolveReady;
  var ready = new Promise(function (r) { resolveReady = r; });
  var ref = referrer();
  /* Use the nickname the page gives this browser, so arrivals show the right name. */
  function nick() { if (mine.nm) return; try { var nk = JSON.parse(localStorage.getItem("on-nick")); if (nk && nk.nm) { mine.nm = nk.nm; mine.col = nk.col; } } catch (e) {} }

  function wsUrl() { return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/live"; }

  function mk(v) {
    return {
      peer: v.peer, isMe: v.peer === meId, sameTab: v.peer === meId, kind: "viewer", guest: false, by: null,
      presence: v.presence || {}, updatedAt: Date.now(), city: v.city || "", country: v.country || "",
      ref: v.ref || "", org: v.org || "", dev: v.dev || "", region: v.region || "", since: v.at || Date.now()
    };
  }
  function list() { return Object.keys(peers).map(function (k) { return peers[k]; }); }

  function emitNow() {
    emitQueued = false;
    var ch = { peers: list(), joined: queue.joined, left: queue.left, updated: queue.updated };
      queue = { joined: [], left: [], updated: [] };
    handlers.forEach(function (fn) { try { fn(ch); } catch (e) { if (window.console) console.error(e); } });
  }
  /* Cursor moves are batched per frame; moments (activity, chat, reactions, waves) are delivered at once
     so two in a row are never merged. */
  function emit(now) {
    if (now) { emitNow(); return; }
    if (emitQueued) return;
    emitQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { if (emitQueued) emitNow(); });
  }
  function isMoment(d) { return !!(d && (d.act || d.msg || d.rxn || d.wave)); }

  function send(obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch (e) {} } return false; }

  function flush() {
    sendTimer = 0;
    if (!pending || !meId) return;
    if (send({ type: "p", d: pending })) { pending = null; lastSend = Date.now(); }
  }
  function schedule() {
    if (sendTimer) return;
    sendTimer = setTimeout(flush, Math.max(0, 60 - (Date.now() - lastSend)));
  }

  function connect() {
    if (dead) return;
    try { ws = new WebSocket(wsUrl()); } catch (e) { retry(); return; }
    ws.onopen = function () {
      tries = 0; nick();
      send({ type: "hello", key: key || "", ref: ref, p: mine });
      clearInterval(pingTimer);
      pingTimer = setInterval(function () { send({ type: "ping" }); }, 25000);
    };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.type) return;
      if (m.type === "init") {
        var before = peers, first = !everConnected;
        meId = m.you; owner = !!m.owner; everConnected = true; peers = {};
        peers[meId] = mk({ peer: meId, presence: mine });
        (m.peers || []).forEach(function (v) { peers[v.peer] = mk(v); });
        if (first) queue.joined = list();
        else Object.keys(before).forEach(function (k) { if (!peers[k] && before[k] && !before[k].isMe) queue.left.push(before[k]); });
        resolveReady(api); emit();
        if (pending) schedule();
      } else if (m.type === "join" && m.peer) {
        var p = mk(m.peer); peers[p.peer] = p; queue.joined.push(p); emit();
      } else if (m.type === "upd" && peers[m.peer]) {
        var q = peers[m.peer], np = {}, k;
        for (k in q.presence) np[k] = q.presence[k];
        for (k in m.d) np[k] = m.d[k];
        q.presence = np; q.updatedAt = Date.now(); queue.updated.push(q); emit(isMoment(m.d));
      } else if (m.type === "leave" && peers[m.peer]) {
        queue.left.push(peers[m.peer]); delete peers[m.peer]; emit();
      }
    };
    ws.onclose = function (ev) {
      clearInterval(pingTimer);
      ws = null;
      if (ev && (ev.code === 4003 || ev.code === 4001)) { dead = true; peers = {}; errHandlers.forEach(function (f) { try { f(ev); } catch (e) {} }); return; }
      if (!document.hidden) retry();
    };
    ws.onerror = function () {};
  }
  function retry() {
    if (dead) return;
    tries++;
    var wait = (tries > 8 ? 300000 : Math.min(30000, 1000 * Math.pow(2, Math.min(tries, 5)))) * (0.7 + Math.random() * 0.6);
    setTimeout(function () { if (!ws && !document.hidden) connect(); }, wait);
  }

  /* Close the socket after five minutes in a background tab; reconnect on return. */
  document.addEventListener("visibilitychange", function () {
    clearTimeout(hiddenTimer);
    if (document.hidden) hiddenTimer = setTimeout(function () { if (ws) ws.close(1000, "hidden"); }, 5 * 60 * 1000);
    else if (!ws && !dead) connect();
  });

  var api = {
    presence: function (patch) {
      if (!patch || typeof patch !== "object") return Promise.resolve();
      if (isMoment(patch) && pending && isMoment(pending)) flush();
      pending = pending || {};
      for (var k in patch) { mine[k] = patch[k]; pending[k] = patch[k]; }
      if (meId && peers[meId]) { peers[meId].presence = mine; peers[meId].updatedAt = Date.now(); }
      if (isMoment(patch)) { clearTimeout(sendTimer); flush(); } else schedule();
      return Promise.resolve();
    },
    peers: list,
    onPeers: function (fn, onErr) {
      if (typeof fn === "function") handlers.push(fn);
      if (typeof onErr === "function") errHandlers.push(onErr);
      if (meId) fn({ peers: list(), joined: [], left: [], updated: [] });
      return function () { handlers = handlers.filter(function (h) { return h !== fn; }); };
    },
    isOwner: function () { return owner; },
    history: function () {
      return fetch("/api/history?limit=150", { headers: { "x-owner-key": key || "" } })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) { return d.rows || []; });
    },
    kick: function (peer) { return Promise.resolve(send({ type: "kick", peer: String(peer) })); }
  };

  window.siteLive = { ready: ready };
  /* Only connect when the live server is there (static hosts like GitHub Pages don't have it). */
  fetch("/api/health", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.ok) connect(); }).catch(function () {});
})();
