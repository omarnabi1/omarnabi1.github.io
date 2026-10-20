/* Analytics: PostHog, loaded first-party through /ingest so it isn't blocked.
   Off when no key is set, for the site owner, and for Do Not Track / Global Privacy Control. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, q = [];
  window.track = function (name, props) {
    try {
      if (window.posthog && window.posthog.__loaded) window.posthog.capture(name, props || {});
      else if (q.length < 50) q.push([name, props || {}]);
    } catch (e) {}
  };
  if (!C.posthogKey) return;
  try { if (localStorage.getItem("on-owner-key") || localStorage.getItem("ph-optout")) return; } catch (e) {}
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return;
  var ui = C.posthogRegion === "eu" ? "https://eu.posthog.com" : "https://us.posthog.com";
  var s = document.createElement("script");
  s.async = true;
  s.src = "/ingest/static/array.js";
  s.onload = function () {
    if (!window.posthog || !window.posthog.init) return;
    window.posthog.init(C.posthogKey, {
      api_host: location.origin + "/ingest",
      ui_host: ui,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      loaded: function (ph) { q.forEach(function (e) { ph.capture(e[0], e[1]); }); q = []; }
    });
  };
  document.head.appendChild(s);
})();
