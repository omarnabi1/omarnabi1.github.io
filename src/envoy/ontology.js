// Envoy ontology: one fixed vocabulary for every conflict.
//
// Campaigns keep their local, precise tags ("durand", "enrichment_right"). The ontology maps each local
// tag to a canonical INTEREST FAMILY so that anything learned on one conflict (lever library, what-if
// results, backtests against real agreements) transfers to any other. The engine's local matching is
// unchanged; cross-table reasoning uses families.
//
// Families are grounded in the PA-X peace agreement taxonomy (University of Edinburgh, 2,257 agreements
// since 1990, 225+ coded provision categories), collapsed to a size a game and a simulator can reason
// over. PAX below lists which PA-X searchable sub-categories feed each family.

export const FAMILIES = {
  security:       { name: "Security",               what: "Freedom from attack: ceasefires, truces, protection, guarantees.", pax: ["ceasefire", "general", "protection measures", "armed forces", "rebel/opposition/para-statal forces", "terrorism", "crime"] },
  territory:      { name: "Territory",              what: "Borders, land, control of space, status of disputed areas.", pax: ["border delimitation", "cross-border provisions", "state configuration", "territorial"] },
  recognition:    { name: "Recognition and status",  what: "Legitimacy, recognition, dignity, a seat at the table.", pax: ["nature of state (general)", "state symbols", "other international signatory", "UN Signatory"] },
  governance:     { name: "Governance",             what: "Who rules and how: power-sharing, elections, institutions, inclusion.", pax: ["political", "political institutions (new, reformed or temporary)", "elections", "constitutional renewal", "constitutional reform", "electoral commission", "civil society", "traditional/religious leaders", "public administration (civil services)"] },
  autonomy:       { name: "Autonomy and self-rule", what: "Self-determination, devolution, statehood, unification or secession.", pax: ["self-determination", "referendum", "independence/secession", "accession/unification"] },
  rights:         { name: "Rights",                 what: "Human rights, equality, education, women, minorities.", pax: ["human rights/rule of law", "equality", "civil and political rights", "socioeconomic rights", "women, girls and gender", "racial/ethnic/national groups", "religious groups", "indigenous people", "citizenship", "media and communication", "democracy"] },
  accountability: { name: "Justice and accountability", what: "Prisoners, amnesty, victims, the missing, truth and reparations.", pax: ["amnesty/pardon", "prisoner release", "courts", "mechanism", "vetting", "victims", "missing", "reparation", "reconciliation", "detention procedures", "prisons and detention"] },
  economy:        { name: "Economy",                what: "Money, trade, sanctions, reconstruction, salaries, investment.", pax: ["development or socio-economic reconstruction", "national economic plan", "international funds", "business", "taxation", "banks", "economic"] },
  resources:      { name: "Resources",              what: "Water, minerals, energy, land, who gets what from the ground.", pax: ["natural resources", "water rights", "land reform/rights", "environment", "pastoralist/nomadic rights", "cultural heritage"] },
  access:         { name: "Access and movement",    what: "Humanitarian access, open ports and roads, shipping lanes, freedom of movement.", pax: ["mobility/access"] },
  displacement:   { name: "Displacement",           what: "Refugees, returns, resettlement.", pax: ["refugees/displaced persons", "migrant workers"] },
  arms:           { name: "Arms and forces",        what: "Weapons limits, disarmament, demobilization, nuclear and missile caps.", pax: ["DDR", "military", "police", "intelligence services", "drugs"] },
  external:       { name: "External actors",        what: "Foreign troops, proxies, alliances, peacekeepers, outside guarantors.", pax: ["withdrawal of foreign forces", "international mission/force/similar"] },
  verification:   { name: "Verification",           what: "Inspections, monitoring, shared data, enforcement.", pax: ["enforcement mechanism", "referendum for agreement"] },
  process:        { name: "Process",                what: "Talks, timelines, arbitration, the framework of the deal itself.", pax: ["Criminal justice reform and emergency provisions", "judiciary and courts", "traditional/religious laws"] },
};
export const FAMILY_IDS = Object.keys(FAMILIES);

// Local tag -> family. Every tag used by a curated campaign is listed; AI-built tags fall through to
// the keyword rules below, then to "process" with a warning from validateCampaign.
export const TAG_FAMILY = {
  // security
  ceasefire: "security", freeze: "security", israel_security: "security", ukraine_security: "security", border_security: "security",
  counterterror: "security", minority_security: "security", no_invasion: "security", policing: "security", status_quo: "security",
  // territory
  durand: "territory", cede_territory: "territory", claim_dropped: "territory", border_mechanism: "territory", all_ireland: "territory", joint_authority: "territory",
  // recognition
  recognition: "recognition", gdr_recognition: "recognition", regional: "recognition", public_trade: "recognition", treaty: "recognition",
  // governance
  power_sharing: "governance", consent: "governance", consult: "governance",
  // autonomy
  statehood: "autonomy", neutrality: "autonomy",
  // rights
  rights: "rights", education: "rights",
  // accountability
  prisoners: "accountability", guantanamo: "accountability",
  // economy
  economy: "economy", money: "economy", trade: "economy", sanctions_relief: "economy", quotas: "economy", energy: "economy",
  // resources
  flow_rules: "resources", storage: "resources", sediment: "resources", moratorium: "resources",
  // access
  access: "access", shipping: "access", blockade_end: "access",
  // displacement
  refugees: "displacement",
  // arms
  nuclear_limits: "arms", enrichment_right: "arms", missile_limits: "arms", missiles_out: "arms", jupiters_out: "arms", proxy_limits: "arms",
  decommission: "arms", disarm: "arms", armed_hamas: "arms", troop_cuts: "arms",
  // external
  foreign_troops: "external", nato_cover: "external",
  // verification
  inspections: "verification", inspection: "verification", data: "verification",
  // process
  arbitration: "process", deal: "process",
  // backtest cases (src/envoy/backtests.js)
  territory_share: "territory", foreign_force: "external", elections: "governance", unitary: "governance", partition: "territory",
  autonomy_within: "autonomy", independence: "autonomy", ddr: "arms", troop_withdrawal: "external", amnesty: "accountability", resource_revenue: "resources", local_parties: "governance", monitoring: "verification",
  transitional_justice: "accountability", land_reform: "resources", political_seats: "governance", drugs: "economy", blanket_amnesty: "accountability", prison_terms: "accountability",
  devolution: "autonomy", land_rights: "resources", indigenous_recognition: "rights", settler_removal: "displacement",
  deferred_referendum: "autonomy", mine_reopen: "resources", two_armies: "arms", secular_state: "rights", single_army: "arms",
};

// Keyword fallbacks for AI-generated tags.
const RULES = [
  [/cease|truce|secur|protect|safe|attack|terror|polic|guarant/, "security"],
  [/border|territor|land|frontier|line|cede|claim|annex|enclave|island/, "territory"],
  [/recogn|legitim|status|dignity|seat|embassy|normaliz/, "recognition"],
  [/power|govern|elect|parliament|council|assembly|constitut|inclus|share/, "governance"],
  [/autonom|self|independ|secess|statehood|devolv|referend|unif|neutral/, "autonomy"],
  [/right|educat|women|girl|minorit|equal|speech|press|citizen/, "rights"],
  [/prison|detain|hostage|amnest|justice|truth|victim|missing|reparat|tribunal/, "accountability"],
  [/econom|trade|money|sanction|fund|invest|salar|debt|tax|bank|aid|loan|market/, "economy"],
  [/water|river|dam|oil|gas|mineral|lithium|mine|energy|grain|fish|forest|resource/, "resources"],
  [/access|port|corridor|shipping|route|blockade|movement|crossing|road|airport/, "access"],
  [/refuge|return|displace|resettl|migrant|deport/, "displacement"],
  [/arm|weapon|missile|nuclear|enrich|disarm|decommission|demobil|troop|militia|proxy/, "arms"],
  [/foreign|nato|peacekeep|alliance|base|withdraw|outside|guarantor/, "external"],
  [/inspect|monitor|verif|data|observer|audit/, "verification"],
  [/talk|arbitrat|timeline|deadline|framework|mediat|process|treaty/, "process"],
];

export function familyOf(tag) {
  const t = String(tag || "").toLowerCase();
  if (TAG_FAMILY[t]) return TAG_FAMILY[t];
  for (const [re, f] of RULES) if (re.test(t)) return f;
  return null;
}
export const familiesOf = (tags) => [...new Set((tags || []).map(familyOf).filter(Boolean))];

// Lever types: the moves a mediator or a party can make, independent of conflict. Each lever names the
// families it usually touches. Campaign clauses are instances of "clause"; engine actions map to the rest.
export const LEVERS = {
  clause:    { name: "Treaty clause",        what: "A written term in the deal.", families: [] },
  listen:    { name: "Back-channel",         what: "Learn a party's real position.", families: ["process"] },
  message:   { name: "Offer",                what: "Float a term to one party.", families: ["process"] },
  aid:       { name: "Humanitarian aid",     what: "Lower pressure on the ground.", families: ["economy", "access"] },
  keepers:   { name: "Peacekeepers",         what: "Outside force freezes a front.", families: ["external", "security"] },
  summit:    { name: "Open talks",           what: "Bring the parties to one table.", families: ["process", "recognition"] },
  deal:      { name: "Sign a package",       what: "Put 1 to 3 clauses to a vote.", families: ["process"] },
  // Party-side levers (seat mode and what-if hypotheses). The engine does not run these yet; the lab
  // models them as changes to interests, resources and tension.
  trade_deal:  { name: "Trade or resource deal", what: "Sell what you have to someone new.", families: ["economy", "resources"] },
  guarantee:   { name: "Security guarantee",    what: "An outside power vouches for you.", families: ["external", "security"] },
  diversify:   { name: "Diversify a dependency", what: "Cut reliance on one supplier or patron.", families: ["economy", "resources", "external"] },
  concession:  { name: "Unilateral concession",  what: "Give something first to unlock talks.", families: [] },
};

// Actor archetypes decide which seats a player may take and how the AI runs the rest.
export const ACTOR_KINDS = {
  state:       { name: "State",            playable: true },
  bloc:        { name: "Bloc or coalition", playable: true },
  institution: { name: "Institution",      playable: true },
  civil:       { name: "Civil society",    playable: true },
  company:     { name: "Company or sector", playable: true },
  armed:       { name: "Armed non-state",  playable: false },
  hidden:      { name: "Hidden actor",     playable: false },
};
export function kindOf(p) {
  if (p.kind && ACTOR_KINDS[p.kind]) return p.kind;
  const n = `${p.name} ${p.short}`.toLowerCase();
  if (/hidden|unknown/.test(n)) return "hidden";
  if (/guard|army|brigade|militia|front|rebel|guerrilla|insurg|ansar|hamas|hezbollah|taliban|ira\b|forces|fighters/.test(n)) return "armed";
  if (/women|civil|communit|elders|tribe|villag|union|farmer|people/.test(n)) return "civil";
  if (/compan|corp|mining|industr|consortium|sector|shipping/.test(n)) return "company";
  if (/donor|nations|eu\b|europe|gulf states|bloc|coalition|mediator|allies/.test(n)) return "bloc";
  if (/bank|fund|court|church|commission|agency/.test(n)) return "institution";
  return "state";
}

// Resources and dependencies (optional on parties). Shape:
//   has:   { lithium: 70, transit: 90 }         what the actor controls, 0-100 of the table's supply
//   needs: { cash: { from: "donors", share: 80 }, fuel: { from: "irgov", share: 60 } }
// A need with share >= 60 on one supplier is a single point of failure: pressure from that supplier bites.
export const SPOF_SHARE = 60;
export function dependencies(p) {
  const out = [];
  for (const [what, d] of Object.entries(p.needs || {})) {
    if (!d || !d.from) continue;
    out.push({ what, from: d.from, share: Math.max(0, Math.min(100, Number(d.share) || 0)) });
  }
  return out;
}
export const singlePoints = (p) => dependencies(p).filter((d) => d.share >= SPOF_SHARE);

// Evidence: documents in a party's own voice, tagged by perspective. The game only carries the count
// (party.docs) and the tier derived from it. understanding() turns that into a 0-1 confidence the
// simulator uses to widen a party's behaviour when CR-AI knows little about it.
export function understanding(p) {
  if (p.tier === "thin") return 0.25;
  if (p.tier === "partial") return 0.6;
  const n = Number(p.docs);
  if (!Number.isFinite(n)) return 0.85;
  return Math.max(0.3, Math.min(1, 0.5 + Math.log10(1 + n) / 4));
}

/* ---------- canonical view of a campaign ---------- */
// Turns any campaign (curated or AI-built) into ontology objects. Pure; used by the lab, the backtests
// and the API, never by the engine's hot path.
export function canonicalize(camp) {
  const warnings = [];
  const tables = camp.hotspots.map((H) => {
    const clauses = H.clauses.map((c) => {
      const fams = familiesOf(c.tags);
      for (const t of c.tags) if (!familyOf(t)) warnings.push(`${H.id}/${c.id}: tag "${t}" has no family`);
      return { id: c.id, name: c.name, tags: c.tags, families: fams.length ? fams : ["process"] };
    });
    const actors = H.parties.map((p) => ({
      id: p.id,
      name: p.name,
      short: p.short,
      kind: kindOf(p),
      playable: ACTOR_KINDS[kindOf(p)].playable,
      veto: !!p.veto,
      understanding: understanding(p),
      wants: familiesOf(p.wants),
      dislikes: familiesOf(p.dislikes),
      red: familiesOf([...(p.red || []), ...Object.keys(p.redUnless || {})]),
      resources: { has: p.has || {}, deps: dependencies(p), spof: singlePoints(p) },
    }));
    return { id: H.id, name: H.name, families: [...new Set(clauses.flatMap((c) => c.families))], clauses, actors };
  });
  return { id: camp.id, title: camp.title, era: camp.era, year: camp.year, tables, warnings };
}

export function validateCampaign(camp) {
  const errors = [];
  if (!camp || !Array.isArray(camp.hotspots) || !camp.hotspots.length) return { ok: false, errors: ["no hotspots"], warnings: [] };
  const allTags = new Set(camp.hotspots.flatMap((H) => (H.clauses || []).flatMap((c) => c.tags || [])));
  const soft = [];
  for (const H of camp.hotspots) {
    if (!H.clauses || H.clauses.length < 2) errors.push(`${H.id}: needs at least 2 clauses`);
    if (!H.parties || H.parties.length < 2) errors.push(`${H.id}: needs at least 2 parties`);
    const tagSet = new Set((H.clauses || []).flatMap((c) => c.tags));
    for (const p of H.parties || []) {
      if (!(p.wants || []).length) errors.push(`${H.id}/${p.id}: wants nothing`);
      if (!(p.wants || []).some((t) => tagSet.has(t))) errors.push(`${H.id}/${p.id}: wants nothing this table offers`);
      // A want satisfied only at another table is legal: the engine's cross-table memory rewards it.
      for (const t of p.wants || []) if (!tagSet.has(t)) (allTags.has(t) ? soft : errors).push(`${H.id}/${p.id}: wants "${t}" which ${allTags.has(t) ? "only another table offers" : "no clause offers"}`);
      for (const d of dependencies(p)) if (d.from !== "world" && !H.parties.some((q) => q.id === d.from)) errors.push(`${H.id}/${p.id}: depends on unknown party "${d.from}"`);
    }
  }
  const { warnings } = canonicalize(camp);
  return { ok: !errors.length, errors, warnings: [...soft, ...warnings] };
}
