// Backtest cases: resolved conflicts encoded from the situation BEFORE the agreement, on the ontology.
//
// Each case is one table. Clauses are terms that were actually on the table during the process, including
// terms that were debated and NOT signed (distractors). "signed" lists the clauses in the real agreement,
// per PA-X's provision coding and the public text of each agreement. Party interests are their stated
// positions going into the final round, not the outcome.
//
// The test (test/envoy-backtest.mjs) asks: with no case-specific tuning, does the lab's best package
// recover the real deal's interest families? Tags are canonical family ids or local tags that map to them.

const P = (id, name, short, icon, o) => ({ id, name, short, icon, veto: false, mood: 35, tier: "documented", docs: 50, wants: [], dislikes: [], red: [], cards: { goal: { t: o.goal || "" }, flex: { t: o.flex || "" }, red: { t: o.redText || "" } }, ...o });
const CASE = (o) => ({ id: o.id, era: "past", year: o.year, title: o.title, tagline: o.tagline, unit: "Month", months: 12, envoys: 3, goal: 1, globalStart: 40, note: o.note, type: o.type, source: o.source, links: [], events: o.events || [], twists: [{ id: "asis", name: "As it was", text: "" }], hotspots: [{ id: o.hs, name: o.name, lat: o.lat, lon: o.lon, tension: o.tension, flavor: o.flavor || "", clauses: o.clauses, parties: o.parties, history: { text: o.history, clauses: o.signed } }] });

export const BACKTESTS = [
  CASE({
    id: "dayton", year: 1995, type: "mixed", title: "Dayton", tagline: "Bosnia, autumn 1995.", hs: "bih", name: "Bosnia and Herzegovina", lat: 43.9, lon: 17.7, tension: 80,
    source: "General Framework Agreement for Peace in Bosnia and Herzegovina, Dec 1995; PA-X coding: territorial power-sharing, ceasefire, international force, refugees, elections, constitution.",
    history: "Single state with two entities (51/49), IFOR deployment, right of return, elections and a new constitution. No partition, no unitary state.",
    clauses: [
      { id: "entities", name: "One state, two entities (51/49)", tags: ["territory_share", "governance"] },
      { id: "ceasefire", name: "Permanent ceasefire", tags: ["ceasefire"] },
      { id: "ifor", name: "NATO-led implementation force", tags: ["foreign_force"] },
      { id: "return", name: "Right of return for the displaced", tags: ["refugees"] },
      { id: "elections", name: "Elections under international supervision", tags: ["elections"] },
      { id: "unitary", name: "Unitary Bosnian state", tags: ["unitary"], excludes: ["entities", "partition"] },
      { id: "partition", name: "Partition into three states", tags: ["partition"], excludes: ["entities", "unitary"] },
    ],
    signed: ["entities", "ceasefire", "ifor", "return", "elections"],
    parties: [
      P("sarajevo", "Bosnian government", "Sarajevo", "🇧🇦", { veto: true, mood: 30, wants: ["unitary", "refugees", "foreign_force"], dislikes: ["territory_share"], red: ["partition"], goal: "A single Bosnian state.", flex: "Accepts entities if the state survives on paper.", redText: "Partition." }),
      P("pale", "Bosnian Serb leadership (via Belgrade)", "Serbs", "🇷🇸", { veto: true, mood: 28, wants: ["territory_share", "ceasefire"], dislikes: ["refugees", "elections"], red: ["unitary"], goal: "A Serb entity with real powers.", flex: "Accepts one state if the entity keeps its army and police.", redText: "A unitary state run from Sarajevo." }),
      P("zagreb", "Croatia and Bosnian Croats", "Croats", "🇭🇷", { mood: 36, wants: ["territory_share", "ceasefire"], dislikes: ["unitary"], red: [], goal: "Croat weight inside the Federation.", flex: "Backs the Federation it signed in 1994.", redText: "None stated." }),
      P("contact", "US-led Contact Group", "Contact Group", "🌐", { mood: 50, wants: ["ceasefire", "foreign_force", "elections", "refugees"], dislikes: ["partition"], red: [], goal: "A signed deal before winter.", flex: "Will deploy troops to guarantee it.", redText: "Partition." }),
    ],
  }),
  CASE({
    id: "aceh", year: 2005, type: "intrastate", title: "Helsinki", tagline: "Aceh, 2005, after the tsunami.", hs: "aceh", name: "Aceh", lat: 4.7, lon: 96.7, tension: 62,
    source: "Memorandum of Understanding between the Government of Indonesia and GAM, Helsinki, Aug 2005; PA-X: self-government, amnesty, DDR, withdrawal of forces, local parties, natural resource revenue, monitoring mission, human rights court.",
    history: "Self-government inside Indonesia (not independence), GAM disarms and non-local troops withdraw, amnesty, Aceh keeps 70% of resource revenue, local parties allowed, an EU-ASEAN monitoring mission.",
    clauses: [
      { id: "selfgov", name: "Self-government within Indonesia", tags: ["autonomy_within"] },
      { id: "indep", name: "Independence referendum", tags: ["independence"], excludes: ["selfgov"] },
      { id: "ddr", name: "GAM disarms, troops withdraw", tags: ["ddr", "troop_withdrawal"] },
      { id: "amnesty", name: "Amnesty for GAM members", tags: ["amnesty"] },
      { id: "revenue", name: "Aceh keeps 70% of resource revenue", tags: ["resource_revenue"] },
      { id: "parties", name: "Local political parties allowed", tags: ["local_parties"] },
      { id: "amm", name: "International monitoring mission", tags: ["monitoring"] },
    ],
    signed: ["selfgov", "ddr", "amnesty", "revenue", "parties", "amm"],
    parties: [
      P("jakarta", "Government of Indonesia", "Jakarta", "🇮🇩", { veto: true, mood: 34, wants: ["ddr", "autonomy_within"], dislikes: ["local_parties"], red: ["independence"], goal: "Aceh stays Indonesian and GAM disarms.", flex: "Wide autonomy and amnesty if the arms go.", redText: "Any path to independence." }),
      P("gam", "Free Aceh Movement (GAM)", "GAM", "⚔️", { veto: true, mood: 30, tier: "partial", wants: ["independence", "resource_revenue", "local_parties", "amnesty"], dislikes: ["ddr"], red: [], goal: "Self-rule and a share of Aceh's wealth.", flex: "Drops independence for real self-government and its own parties.", redText: "Disarming with nothing in return." }),
      P("cmi", "Crisis Management Initiative (mediator)", "Mediator", "🕊️", { mood: 52, wants: ["monitoring", "autonomy_within", "amnesty"], dislikes: [], red: [], goal: "A monitored, implementable deal.", flex: "Brings the EU in to monitor.", redText: "None." }),
    ],
  }),
  CASE({
    id: "colombia", year: 2016, type: "intrastate", title: "Havana", tagline: "Colombia, 2016, after 52 years.", hs: "col", name: "Colombia", lat: 4.6, lon: -74.1, tension: 58,
    source: "Final Agreement to End the Armed Conflict (Havana), Nov 2016; PA-X: ceasefire, DDR, transitional justice mechanism, victims, land reform, political participation, drugs.",
    history: "Bilateral ceasefire and FARC demobilization, a special jurisdiction for peace instead of ordinary prison, rural land reform, guaranteed congressional seats for the FARC party, crop substitution. No blanket amnesty and no extradition ban.",
    clauses: [
      { id: "ceasefire", name: "Bilateral ceasefire and FARC disarms", tags: ["ceasefire", "ddr"] },
      { id: "jep", name: "Special jurisdiction with reduced sentences", tags: ["transitional_justice"] },
      { id: "land", name: "Rural land reform", tags: ["land_reform"] },
      { id: "seats", name: "Guaranteed congressional seats", tags: ["political_seats"] },
      { id: "crops", name: "Coca crop substitution", tags: ["drugs"] },
      { id: "blanket", name: "Blanket amnesty for all crimes", tags: ["blanket_amnesty"], excludes: ["jep", "prison"] },
      { id: "prison", name: "Ordinary prison for FARC leaders", tags: ["prison_terms"], excludes: ["jep", "blanket"] },
    ],
    signed: ["ceasefire", "jep", "land", "seats", "crops"],
    parties: [
      P("bogota", "Government of Colombia", "Bogotá", "🇨🇴", { veto: true, mood: 38, wants: ["ceasefire", "ddr", "drugs"], dislikes: ["political_seats"], red: ["blanket_amnesty"], goal: "FARC out of arms and out of coca.", flex: "Accepts reduced sentences and seats if the guns go.", redText: "Impunity for serious crimes." }),
      P("farc", "FARC-EP", "FARC", "⚔️", { veto: true, mood: 32, tier: "partial", wants: ["land_reform", "political_seats", "transitional_justice"], dislikes: ["ddr"], red: ["prison_terms"], goal: "A political future and rural reform.", flex: "Demobilizes for seats, land reform and no ordinary prison.", redText: "Prison for its leadership." }),
      P("victims", "Victims' organizations", "Victims", "👥", { mood: 36, wants: ["transitional_justice", "land_reform"], dislikes: ["blanket_amnesty"], red: [], goal: "Truth, reparations and no impunity.", flex: "Accepts reduced sentences with full truth-telling.", redText: "Blanket amnesty." }),
      P("guarantors", "Cuba and Norway (guarantors)", "Guarantors", "🕊️", { mood: 50, wants: ["ceasefire", "transitional_justice"], dislikes: [], red: [], goal: "A signed, verifiable end.", flex: "Hosts and verifies.", redText: "None." }),
    ],
  }),
  CASE({
    id: "cht", year: 1997, type: "intrastate", title: "Chittagong Hill Tracts", tagline: "Bangladesh, 1997.", hs: "cht", name: "Chittagong Hill Tracts", lat: 22.6, lon: 92.2, tension: 55,
    source: "Chittagong Hill Tracts Peace Accord, Dec 1997; PA-X: regional council (territorial power-sharing), land commission, refugee return, withdrawal of camps, amnesty, DDR.",
    history: "A regional council with devolved powers, a land commission, return of refugees from India, withdrawal of temporary army camps, amnesty and surrender of arms. No constitutional recognition of indigenous status and no full autonomy.",
    clauses: [
      { id: "council", name: "Regional council with devolved powers", tags: ["devolution"] },
      { id: "land", name: "Land commission for disputes", tags: ["land_rights"] },
      { id: "return", name: "Refugee return from India", tags: ["refugees"] },
      { id: "camps", name: "Withdrawal of temporary army camps", tags: ["troop_withdrawal"] },
      { id: "arms", name: "Amnesty and surrender of arms", tags: ["amnesty", "ddr"] },
      { id: "constit", name: "Constitutional recognition of indigenous peoples", tags: ["indigenous_recognition"] },
      { id: "settlers", name: "Removal of Bengali settlers", tags: ["settler_removal"] },
    ],
    signed: ["council", "land", "return", "camps", "arms"],
    parties: [
      P("dhaka", "Government of Bangladesh", "Dhaka", "🇧🇩", { veto: true, mood: 36, wants: ["ddr", "amnesty"], dislikes: ["devolution"], red: ["settler_removal", "indigenous_recognition"], goal: "An end to the insurgency without touching the constitution.", flex: "A regional council and a land commission.", redText: "Removing settlers or amending the constitution." }),
      P("pcjss", "PCJSS (Shanti Bahini)", "PCJSS", "⚔️", { veto: true, mood: 30, tier: "partial", wants: ["devolution", "land_rights", "refugees", "troop_withdrawal"], dislikes: [], red: [], goal: "Self-rule and the land back.", flex: "Surrenders arms for devolution and a land commission.", redText: "Disarming before any devolution." }),
      P("hill", "Hill communities and returnees", "Hill people", "👥", { mood: 34, wants: ["refugees", "land_rights", "troop_withdrawal"], dislikes: [], red: [], goal: "Return home and keep the land.", flex: "Backs any deal that brings people home.", redText: "None." }),
    ],
  }),
  CASE({
    id: "bougainville", year: 2001, type: "intrastate", title: "Arawa", tagline: "Bougainville, 2001.", hs: "bgv", name: "Bougainville", lat: -6.2, lon: 155.4, tension: 50,
    source: "Bougainville Peace Agreement, Aug 2001; PA-X: autonomy, deferred independence referendum, weapons disposal, withdrawal of PNG forces, amnesty.",
    history: "Autonomous government now, an independence referendum deferred 10 to 15 years, weapons disposal in stages, PNG forces withdraw, amnesty. No immediate independence and no reopening of the Panguna mine in the deal.",
    clauses: [
      { id: "autonomy", name: "Autonomous Bougainville government", tags: ["autonomy_within"] },
      { id: "referendum", name: "Independence referendum, deferred 10-15 years", tags: ["deferred_referendum"] },
      { id: "weapons", name: "Staged weapons disposal", tags: ["ddr"] },
      { id: "withdraw", name: "PNG forces withdraw", tags: ["troop_withdrawal"] },
      { id: "amnesty", name: "Amnesty and pardon", tags: ["amnesty"] },
      { id: "indep", name: "Immediate independence", tags: ["independence"], excludes: ["autonomy", "referendum"] },
      { id: "mine", name: "Reopen the Panguna mine", tags: ["mine_reopen"] },
    ],
    signed: ["autonomy", "referendum", "weapons", "withdraw", "amnesty"],
    parties: [
      P("png", "Government of Papua New Guinea", "Port Moresby", "🇵🇬", { veto: true, mood: 38, wants: ["ddr", "autonomy_within"], dislikes: ["deferred_referendum"], red: ["independence"], goal: "Keep Bougainville in PNG and end the war.", flex: "Autonomy and a referendum far in the future.", redText: "Independence now." }),
      P("bra", "Bougainville Revolutionary Army and leaders", "BRA", "⚔️", { veto: true, mood: 32, tier: "partial", wants: ["independence", "deferred_referendum", "troop_withdrawal", "amnesty"], dislikes: ["ddr", "mine_reopen"], red: [], goal: "Independence, or a guaranteed vote on it.", flex: "Defers independence for a binding referendum and self-rule.", redText: "No vote ever." }),
      P("nz", "New Zealand and Australia (facilitators)", "Facilitators", "🕊️", { mood: 50, wants: ["ddr", "autonomy_within"], dislikes: [], red: [], goal: "A durable, monitored peace.", flex: "Monitors weapons disposal.", redText: "None." }),
    ],
  }),
  CASE({
    id: "cpa", year: 2005, type: "intrastate", title: "Naivasha", tagline: "Sudan, 2005.", hs: "sdn", name: "Sudan North-South", lat: 9.5, lon: 30.0, tension: 70,
    source: "Comprehensive Peace Agreement, Jan 2005; PA-X: ceasefire, political power-sharing, wealth (oil) sharing, security arrangements (two armies), self-determination referendum, Abyei protocol.",
    history: "Power-sharing in Khartoum, 50/50 oil revenue, two armies with joint units, a six-year interim period, then a self-determination referendum for the South. Sharia stays in the North. No immediate secession, no single national army.",
    clauses: [
      { id: "power", name: "Power-sharing government", tags: ["power_sharing"] },
      { id: "oil", name: "50/50 oil revenue", tags: ["resource_revenue"] },
      { id: "armies", name: "Two armies with joint units", tags: ["two_armies"] },
      { id: "referendum", name: "Self-determination referendum after six years", tags: ["deferred_referendum"] },
      { id: "ceasefire", name: "Permanent ceasefire", tags: ["ceasefire"] },
      { id: "secular", name: "Secular national constitution", tags: ["secular_state"] },
      { id: "onearmy", name: "Single national army now", tags: ["single_army"], excludes: ["armies"] },
    ],
    signed: ["power", "oil", "armies", "referendum", "ceasefire"],
    parties: [
      P("khartoum", "Government of Sudan (NCP)", "Khartoum", "🇸🇩", { veto: true, mood: 32, wants: ["ceasefire", "single_army"], dislikes: ["deferred_referendum", "resource_revenue"], red: ["secular_state"], goal: "Keep the state whole and Islamic law in the North.", flex: "Shares power and oil if the referendum is years away.", redText: "A secular constitution." }),
      P("splm", "SPLM/A", "SPLM", "⚔️", { veto: true, mood: 30, tier: "partial", wants: ["deferred_referendum", "resource_revenue", "two_armies", "power_sharing"], dislikes: ["single_army"], red: [], goal: "Self-determination and a fair share of oil.", flex: "Defers the vote for power, oil and its own army.", redText: "Merging into one army first." }),
      P("igad", "IGAD and the troika (US, UK, Norway)", "IGAD", "🕊️", { mood: 50, wants: ["ceasefire", "power_sharing", "resource_revenue"], dislikes: [], red: [], goal: "A comprehensive deal.", flex: "Guarantees and funds implementation.", redText: "None." }),
    ],
  }),
];
export const BACKTEST_BY_ID = Object.fromEntries(BACKTESTS.map((c) => [c.id, c]));
