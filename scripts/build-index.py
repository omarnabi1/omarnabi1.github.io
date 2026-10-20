"""One-time conversion of the prototype page into the production public/index.html.
Usage: python3 scripts/build-index.py <prototype.html>"""
import sys, re, pathlib

src = pathlib.Path(sys.argv[1]).read_text()
lines = src.split("\n")
assert lines[0].startswith("<!doctype html><html><head>"), "unexpected wrapper"
body = "\n".join(lines[1:])
assert body.rstrip().endswith("</body></html>")
body = body.rstrip()[: -len("</body></html>")].rstrip()

def rep(old, new, count=1):
    global body
    n = body.count(old)
    assert n == count, (n, old[:80])
    body = body.replace(old, new)

# Head: drop the prototype-only bits; they move into the real <head> below.
rep('<title>Omar Nabi</title>\n', '')
rep('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
fonts = re.search(r'<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="[^"]+">\n', body)
assert fonts
body = body.replace(fonts.group(0), '')

# Game: live leaderboard when the production server is present.
rep('<p class="note">Prototype: outcomes are illustrative, and players other than you are samples.</p>',
    '<p class="note" id="gameNote">Prototype: outcomes are illustrative, and players other than you are samples.</p>')
rep('    var HUM = [{ n: "atlas.r"',
    '    var LIVE = !!window.siteLive, REMOTE = null, STAT = null;\n    var HUM = [{ n: "atlas.r"')
rep('''    function rows() { var r = HUM.map(function (h) { return { n: h.n, b: h.b, k: "h" }; }); MODELS.forEach(function (m) { r.push({ n: m.n, b: m.b, k: "m", crai: m.n === "CR-AI" }); }); if (best) r.push({ n: best.name, b: best.brier, k: "h", you: true }); return r.sort(function (a, b) { return a.b - b.b; }); }''',
    '''    function rows() { var youIn = false, r = (REMOTE || HUM).map(function (h) { var y = !!(REMOTE && best && h.n.toLowerCase() === String(best.name).toLowerCase() && Math.abs(h.b - best.brier) < 1e-3); if (y) youIn = true; return { n: h.n, b: h.b, k: "h", you: y }; }); MODELS.forEach(function (m) { r.push({ n: m.n, b: m.b, k: "m", crai: m.n === "CR-AI" }); }); if (best && !youIn) r.push({ n: best.name, b: best.brier, k: "h", you: true }); return r.sort(function (a, b) { return a.b - b.b; }); }
    function fetchBoard() { if (!LIVE || !window.fetch) return; fetch("/api/leaderboard").then(function (x) { return x.json(); }).then(function (d) { if (d && d.rows) { REMOTE = d.rows; STAT = d; board(); } }).catch(function () {}); }
    function submit(picks) { if (!LIVE || !window.fetch || !S.handle || S.handle === "you") return; fetch("/api/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: S.handle, picks: picks }) }).then(function (x) { return x.json(); }).then(function (d) { if (d && d.ok && d.rank) toast("You're #" + d.rank + " on the leaderboard", ""); fetchBoard(); }).catch(function () {}); }''')
rep('''var r = rows(), h = r.filter(function (x) { return x.k === "h"; }), bt = h.filter(function (x) { return x.b < CRAI; }).length;''',
    '''var r = rows(), h = r.filter(function (x) { return x.k === "h"; }), bt = h.filter(function (x) { return x.b < CRAI; }).length, pct = STAT && STAT.players ? Math.round(STAT.beating / STAT.players * 100) : Math.round(bt / Math.max(1, h.length) * 100);''')
rep('''<b>' + Math.round(bt / h.length * 100) + '%</b>''', '''<b>' + pct + '%</b>''')
rep('S.res = yb; if (!best', 'S.res = yb; submit(S.picks.slice()); if (!best')
rep('    intro(); board();\n  })();', '    intro(); board();\n    if (LIVE) { var gn = $("gameNote"); if (gn) gn.textContent = "Live leaderboard. Outcomes are illustrative until these questions resolve. Add your name to join it."; fetchBoard(); }\n  })();')

# Live panel: show company and device instead of member/guest; let the owner remove someone.
rep('''b.appendChild(document.createTextNode(nameOf(p) + (p.guest ? " · guest" : " · member")));''',
    '''b.appendChild(document.createTextNode(nameOf(p) + (p.guest ? " · guest" : p.org ? " · " + p.org : "")));''')
rep('''(p.ref ? " · via " + p.ref : "") + " · active "''', '''(p.ref ? " · via " + p.ref : "") + (p.dev ? " · " + p.dev : "") + " · active "''')
rep('''        row.appendChild(b); row.appendChild(sm);
        var acts = log[p.peer] || [];''',
    '''        row.appendChild(b); row.appendChild(sm);
        if (typeof room.kick === "function") { var kb = document.createElement("button"); kb.type = "button"; kb.className = "pill"; kb.style.cssText = "justify-self:start;margin-top:4px;font-size:.7rem"; kb.textContent = "Remove for 24h"; kb.onclick = function () { room.kick(p.peer); toast("Removed", nameOf(p) + " can't rejoin for 24 hours."); }; row.appendChild(kb); }
        var acts = log[p.peer] || [];''')
rep('''b.textContent = (r.city || "Somewhere") + (r.country ? ", " + r.country : "");''',
    '''b.textContent = (r.city || "Somewhere") + (r.country ? ", " + r.country : "") + (r.org ? " · " + r.org : "");''')
rep('''(r.ref ? " · via " + r.ref : "");
        row.appendChild(b);''', '''(r.ref ? " · via " + r.ref : "") + (r.dev ? " · " + r.dev : "");
        row.appendChild(b);''')

# Footer: privacy link.
rep('Built for fun. Most of it is clickable. <button type="button" class="xray-btn"',
    'Built for fun. Most of it is clickable. <a href="/privacy" style="color:inherit">Privacy</a> <button type="button" class="xray-btn"')

head = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Omar Nabi</title>
<meta name="description" content="Omar Nabi makes complicated systems work as one, and builds what runs on top of them. Play the forecasting game, draft an all-time five, or just say hi.">
<meta name="theme-color" content="#F2541B">
<link rel="canonical" href="https://omarnabi.com/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:url" content="https://omarnabi.com/">
<meta property="og:title" content="Omar Nabi">
<meta property="og:description" content="Unifying complex IT, building with AI. Try to beat my forecasting model.">
<meta property="og:image" content="https://omarnabi.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Omar Nabi">
<meta name="twitter:description" content="Unifying complex IT, building with AI. Try to beat my forecasting model.">
<meta name="twitter:image" content="https://omarnabi.com/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"Omar Nabi","url":"https://omarnabi.com/","jobTitle":"Enterprise Solutions Engineer","address":{"@type":"PostalAddress","addressLocality":"Irvine","addressRegion":"CA"}}</script>
''' + fonts.group(0) + '''<style>[hidden]:not([hidden=until-found i]){display:none!important}body{margin:0}img{max-width:100%}</style>
<script src="/js/config.js"></script>
<script src="/js/live.js"></script>
<script src="/js/analytics.js"></script>
</head>
<body>
'''
out = head + body.lstrip("\n") + "\n</body>\n</html>\n"
pathlib.Path("index.html").write_text(out)
print("wrote index.html", len(out), "bytes")
