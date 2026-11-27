/* ==========================================================================
   Ways to save

     GET /personas                 persona picker
     GET /entries?customer_id=     every saved entry for the persona

   ========================================================================== */

/* 1. Rules and state ----------------------------------------------------- */

const STORAGE_KEY = "capstone.customerId";

// Each rule comes from the recommendations scenario sheet:
//   factor   stakeholder emission factor, kg CO₂e per £ (same values as the categories table in seed.py)
//   gross    share of the month's spend in that subcategory the action avoids
//   replace  food swaps only: share of the avoided spend that goes on groceries and cooking electricity instead
//   perTrip  the saving depends on fares for one trip, so there is no monthly figure (Airplane)
const RULES = [
  { category: "Travel", subcategory: "Self-owned car", factor: 0.55, gross: 0.03,
    action: "Walk or cycle a nearby errand you'd normally drive to, or combine two errands into one drive." },
  { category: "Travel", subcategory: "Motorbike", factor: 0.35, gross: 0.04,
    action: "Walk a shorter errand you'd normally ride to, or group two stops into one ride." },
  { category: "Travel", subcategory: "Bus", factor: 0.20, gross: 0.05,
    action: "Walk or cycle a short trip you'd normally pay a bus fare for, if the route suits you." },
  { category: "Travel", subcategory: "Train", factor: 0.15, gross: 0.05,
    action: "Put two visits on the same day so you can make one train trip and avoid buying a separate ticket." },
  { category: "Travel", subcategory: "Subway", factor: 0.12, gross: 0.04,
    action: "Walk a short Underground journey, if it's convenient and would lower the fare you pay." },
  { category: "Travel", subcategory: "Taxi", factor: 0.45, gross: 0.10,
    action: "Walk a short journey you'd normally take by taxi, if the route suits you." },
  { category: "Travel", subcategory: "Carshare", factor: 0.28, gross: 0.04,
    action: "Plan two shared errands for the same drive, so the car makes one fewer trip." },
  { category: "Travel", subcategory: "Airplane", factor: 1.10, perTrip: true,
    action: "Compare a train with a flight for an upcoming trip where both options work for you." },
  { category: "Food", subcategory: "Groceries", factor: 0.20, gross: 0.03,
    action: "Check your cupboards before shopping and plan one meal around food you already have." },
  { category: "Food", subcategory: "Delivery", factor: 0.38, gross: 0.15, replace: { groceries: 0.40, cooking: 0.05 },
    action: "Batch-cook an extra portion for a night you'd usually order a takeaway." },
  { category: "Food", subcategory: "Restaurant/Dine out", factor: 0.32, gross: 0.10, replace: { groceries: 0.35, cooking: 0.05 },
    action: "Swap a planned meal out for a comparable home-cooked meal." },
  { category: "Utilities", subcategory: "Electricity", factor: 0.30, gross: 0.03,
    action: "Air-dry a few loads you'd normally tumble-dry, if you have a suitable place to dry them." },
  { category: "Utilities", subcategory: "Water", factor: 0.15, gross: 0.03,
    action: "If your water is metered, try a slightly shorter shower on several days each week." },
  { category: "Utilities", subcategory: "Heating", factor: 0.45, gross: 0.04,
    action: "If your heating system supports it, check the timer for a regular period when the home is empty." },
];

// factors for what the food swaps spend instead (sheet: "Replacement inputs")
const REPLACEMENT_FACTOR = { groceries: 0.20, cooking: 0.30 };

// net rates per £ of eligible spend (sheet columns H and I):
//   spend:  gross × (1 − groceries share − cooking share)
//   carbon: gross × (factor − groceries share × 0.20 − cooking share × 0.30)
function netRates(rule) {
  const g = rule.replace?.groceries ?? 0, c = rule.replace?.cooking ?? 0;
  return {
    spend: rule.gross * (1 - g - c),
    carbon: rule.gross * (rule.factor - g * REPLACEMENT_FACTOR.groceries - c * REPLACEMENT_FACTOR.cooking),
  };
}

// the monthly saving for one card, or null when it can't be worked out monthly
function savingFor(rule, spend) {
  if (rule.perTrip) return null;
  const r = netRates(rule);
  return { spend: spend * r.spend, carbon: spend * r.carbon };
}

// add thresholds lin but we can dicsuss
const CATEGORY_THRESHOLD = { Travel: 0, Food: 0, Utilities: 0 };

const state = {
  customerId: null,
  personas: [],
  entries: [],  
  byMonth: {},       
  months: [],         
  selected: null,    
};

const $ = id => document.getElementById(id);


/* 2. Calculations  ------------------------------- */

const money = n => "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = n => Number(n).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " kg CO₂e";
// savings are often under 1 kg, so these keep two decimals (0.14 kg rather than 0.1 kg)
const carbonKg = n => Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg CO₂e";
const tick = n => Number(n.toFixed(2)).toLocaleString("en-GB");

function monthName(ym) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function monthShort(ym, withYear) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", withYear ? { month: "short", year: "2-digit" } : { month: "short" });
}

// every month from first to last, so a month with no entries still appears (as a gap)
function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// entries -> per-month totals. Each entry is counted exactly once.
// adds up the entries into totals for each month
function aggregate(entries) {
  const byMonth = {};
  for (const e of entries) {
    const b = (byMonth[e.month] ||= { spend: 0, carbon: 0, byCat: {}, bySub: {} });
    b.spend += e.amount;
    b.carbon += e.carbonKg;
    b.byCat[e.category] = (b.byCat[e.category] || 0) + e.amount;
    b.bySub[e.subcategory] = (b.bySub[e.subcategory] || 0) + e.amount;
  }
  return byMonth;
}

// axis with four equal steps, so the spending and carbon axes share gridlines
function axisScale(max) {
  if (!(max > 0)) return { top: 4, step: 1 };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rough);
  return { top: step * 4, step };
}

// the flowchart: the category is above its threshold and the subcategory has spending
// and (from the sheet) the card is only shown when both net savings are positive
function relevantRules(b) {
  return RULES.filter(rule => {
    if (!(b.byCat[rule.category] > CATEGORY_THRESHOLD[rule.category] && b.bySub[rule.subcategory] > 0)) return false;
    const s = savingFor(rule, b.bySub[rule.subcategory]);
    return s === null || (s.spend > 0 && s.carbon > 0);
  });
}


/* 3. Loading ------------------------------------------------------------- */

const msg = $("msg");
function showError(text) {
  msg.textContent = text;
  msg.classList.remove("d-none");
}
function clearError() { msg.classList.add("d-none"); }

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// demo "login": the server keeps the persona in the session cookie, and /entries reads it from there
async function startSession(id) {
  const body = new FormData();
  body.append("customer_id", id);
  const res = await fetch("/session", { method: "POST", body });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function loadEntries() {
  try {
    state.entries = await getJSON("/entries");
    clearError();
  } catch {
    state.entries = [];
    showError("Couldn't load your spending. Is the API running?");
  }
  rebuild();
}

function rebuild() {
  state.byMonth = aggregate(state.entries);
  const used = Object.keys(state.byMonth).sort();
  state.months = used.length ? monthRange(used[0], used[used.length - 1]) : [];
  if (!state.months.includes(state.selected)) state.selected = used[used.length - 1] || null;
  renderChart();
  renderRecs();
}


/* 4. History graph ------------------------------------------------------- */

const plot = $("plot");
const tip = $("chart-tip");
const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(name, attrs = {}, ...kids) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

// draws the whole graph
function renderChart() {
  const hasData = state.months.length > 0;
  $("history-chart").classList.toggle("d-none", !hasData);
  $("history-empty").classList.toggle("d-none", hasData);
  plot.replaceChildren();
  hideTip();
  if (!hasData) return;

  const W = plot.clientWidth, H = plot.clientHeight;
  if (!W || !H) return;

  const n = state.months.length;
  const spend = state.months.map(ym => state.byMonth[ym]?.spend ?? null);
  const carbon = state.months.map(ym => state.byMonth[ym]?.carbon ?? null);
  const S = axisScale(Math.max(...spend.filter(v => v !== null)));
  const C = axisScale(Math.max(...carbon.filter(v => v !== null)));
  const sTicks = [0, 1, 2, 3, 4].map(k => "£" + tick(S.step * k));
  const cTicks = [0, 1, 2, 3, 4].map(k => tick(C.step * k) + " kg");

  const m = {
    top: 10,
    bottom: 28,
    left: Math.max(...sTicks.map(t => t.length)) * 6.5 + 14,
    right: Math.max(...cTicks.map(t => t.length)) * 6.5 + 14,
  };
  const innerW = W - m.left - m.right, innerH = H - m.top - m.bottom;
  if (innerW <= 0) return;

  const band = innerW / n;
  const xAt = i => m.left + band * (i + 0.5);
  const yAt = (v, axis) => m.top + innerH * (1 - v / axis.top);
  const sel = state.months.indexOf(state.selected);
  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Spending and carbon by month" });

  if (sel >= 0) svg.append(svgEl("rect", { class: "sel-band", x: m.left + band * sel, y: m.top, width: band, height: innerH }));

  for (let k = 0; k <= 4; k++) {
    const y = m.top + innerH * (1 - k / 4);
    if (k) svg.append(svgEl("line", { class: "grid", x1: m.left, x2: W - m.right, y1: y, y2: y }));
    svg.append(
      svgEl("text", { x: m.left - 8, y, "text-anchor": "end", "dominant-baseline": "middle" }, sTicks[k]),
      svgEl("text", { x: W - m.right + 8, y, "text-anchor": "start", "dominant-baseline": "middle" }, cTicks[k]),
    );
  }
  svg.append(svgEl("path", { class: "axis", d: `M${m.left} ${m.top}V${m.top + innerH}H${W - m.right}V${m.top}` }));

  const multiYear = state.months[0].slice(0, 4) !== state.months[n - 1].slice(0, 4);
  const every = Math.max(1, Math.ceil((multiYear ? 54 : 36) / band));
  state.months.forEach((ym, i) => {
    if ((n - 1 - i) % every) return;
    svg.append(svgEl("text", { class: i === sel ? "month sel" : "month", x: xAt(i), y: m.top + innerH + 18, "text-anchor": "middle" }, monthShort(ym, multiYear)));
  });

  // a month with no data breaks the line instead of being drawn as zero
  const line = (values, axis, cls) => {
    let d = "", pen = false;
    values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v, axis).toFixed(1)}`;
      pen = true;
    });
    return svgEl("path", { class: `line ${cls}`, d });
  };
  const dots = (values, axis, cls, square) => values.forEach((v, i) => {
    if (v === null) return;
    const r = i === sel ? 6 : 4, x = xAt(i), y = yAt(v, axis);
    svg.append(square
      ? svgEl("rect", { class: `dot ${cls}`, x: x - r, y: y - r, width: r * 2, height: r * 2 })
      : svgEl("circle", { class: `dot ${cls}`, cx: x, cy: y, r }));
  });
  svg.append(line(spend, S, "spend"), line(carbon, C, "carbon"));
  dots(spend, S, "spend", false);
  dots(carbon, C, "carbon", true);

  state.months.forEach((ym, i) => {
    const b = state.byMonth[ym];
    const label = b ? `${monthName(ym)}: spending ${money(b.spend)}, carbon ${kg(b.carbon)}` : `${monthName(ym)}: no spending recorded`;
    svg.append(svgEl("rect", {
      class: "hit", x: m.left + band * i, y: m.top, width: band, height: innerH + m.bottom,
      tabindex: 0, role: "button", "aria-pressed": i === sel,
      "aria-label": `${label}. Select to see its recommendations.`, "data-month": ym,
    }));
  });
  plot.append(svg);

}

function selectMonth(ym) {
  if (ym === state.selected) return;
  const hadFocus = document.activeElement?.classList.contains("hit");
  state.selected = ym;
  renderChart();
  renderRecs();
  if (hadFocus) plot.querySelector(`.hit[data-month="${ym}"]`)?.focus();
}

// for when u hover over the lines, appears with the carbon and spending values

function showTip(ym, x, y) {
  const b = state.byMonth[ym];
  const row = (cls, label, value) => {
    const r = document.createElement("span");
    r.className = "tip-row";
    const sw = document.createElement("span");
    sw.className = `tip-sw ${cls}`;
    const v = document.createElement("b");
    v.textContent = value;
    r.append(sw, label, v);
    return r;
  };
  const head = document.createElement("span");
  head.className = "tip-month";
  head.textContent = monthName(ym);

  if (b) {
    tip.replaceChildren(head, row("spend", "Spending", money(b.spend)), row("carbon", "Carbon", kg(b.carbon)));
  } else {
    const none = document.createElement("span");
    none.className = "tip-row";
    none.textContent = "No spending recorded";
    tip.replaceChildren(head, none);
  }
  tip.hidden = false;

  const card = tip.offsetParent.getBoundingClientRect();
  let left = x - card.left + 14;
  if (left + tip.offsetWidth > card.width - 8) left = x - card.left - tip.offsetWidth - 14;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${y - card.top + 14}px`;
}
function hideTip() { tip.hidden = true; }

plot.addEventListener("mousemove", e => {
  const hit = e.target.closest(".hit");
  if (hit) showTip(hit.dataset.month, e.clientX, e.clientY); else hideTip();
});
plot.addEventListener("mouseleave", hideTip);
plot.addEventListener("focusin", e => {
  const hit = e.target.closest(".hit");
  if (!hit) return hideTip();
  const r = hit.getBoundingClientRect();
  showTip(hit.dataset.month, r.left + r.width / 2, r.top + 24);
});
plot.addEventListener("focusout", hideTip);
plot.addEventListener("click", e => {
  const hit = e.target.closest(".hit");
  if (hit) selectMonth(hit.dataset.month);
});
plot.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("hit")) {
    e.preventDefault();
    selectMonth(e.target.dataset.month);
  }
});

new ResizeObserver(renderChart).observe(plot);


/* 5. Recommendations ----------------------------------------------------- */

const recList = $("rec-list");

// small helper for building the cards and the total
function make(tag, cls, text) {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// builds one recommendation card
function recCard(rule, ym, spend) {
  const li = make("li", "rec");
  li.dataset.sub = rule.subcategory;

  // left: what to do and why; right: what it saves
  const body = make("div", "rec-body");
  const text = make("div", "rec-text");
  text.append(
    make("span", "rec-tag", `${rule.category} · ${rule.subcategory}`),
    make("span", "rec-action", rule.action),
    make("span", "rec-basis", `Based on ${money(spend)} spent on ${rule.subcategory} in ${monthName(ym)}`),
  );

  const s = savingFor(rule, spend);
  const saving = make("div", "rec-saving");
  if (s) {
    // screen readers hear "Could save £7.74 and 4.26 kg CO₂e a month"
    saving.append(
      make("span", "rec-saving-label", "Could save"),
      make("span", "rec-money", money(s.spend)),
      make("span", "visually-hidden", " and "),
      make("span", "rec-carbon", carbonKg(s.carbon)),
      make("span", "rec-per", " a month"),
    );
  } else {
    saving.classList.add("muted");
    saving.append(
      make("span", "rec-saving-label", "Savings"),
      make("span", "rec-per", "Depend on the flight and train fares for your trip"),
    );
  }
  body.append(text, saving);

  li.append(body);
  return li;
}

// works out which recommendations to show for the selected month and fills the list
function renderRecs() {
  const ym = state.selected;
  const b = ym ? state.byMonth[ym] : null;
  const rules = b ? relevantRules(b) : [];

  recList.replaceChildren(...rules.map(r => recCard(r, ym, b.bySub[r.subcategory])));
  renderTotal(rules, ym, b);

  // no month at all, a month with no entries (a gap), or a month where no rule applies
  const text = !ym ? "No spending yet. Add a month to get recommendations."
    : !b ? `No spending recorded in ${monthName(ym)}.`
    : rules.length ? ""
    : `Nothing to suggest for ${monthName(ym)} yet.`;
  const empty = $("rec-empty");
  empty.textContent = text;
  empty.classList.toggle("d-none", !text);
  $("add-link").classList.toggle("d-none", state.months.length > 0);
}

// the most you could save by following every tip shown. Each tip applies to a different
// subcategory's spending, so the savings don't overlap and can simply be added up.
// Tips without a monthly figure (Airplane) can't be added, so they're mentioned instead.
function renderTotal(rules, ym, b) {
  const box = $("rec-total");
  box.classList.toggle("d-none", !b);           // no month at all: the recommendations panel explains why
  if (!b) return box.replaceChildren();

  const counted = rules
    .map(rule => ({ rule, s: savingFor(rule, b.bySub[rule.subcategory]) }))
    .filter(x => x.s);
  if (!counted.length) {
    return box.replaceChildren(make("span", "rec-total-detail", `No savings to add up for ${monthName(ym)} yet.`));
  }

  const spend = counted.reduce((t, x) => t + x.s.spend, 0);
  const carbon = counted.reduce((t, x) => t + x.s.carbon, 0);
  const share = n => (n * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "%";

  // headline: the total for every tip
  const figures = make("div", "rec-total-figures");
  figures.append(
    make("span", "rec-money", money(spend)),
    make("span", "visually-hidden", " and "),
    make("span", "rec-carbon", carbonKg(carbon)),
    make("span", "rec-per", "a month"),
  );

  // where it comes from: one line per category, in the same order as the cards
  const byCat = new Map();
  for (const { rule, s } of counted) {
    const c = byCat.get(rule.category) || { spend: 0, carbon: 0 };
    byCat.set(rule.category, { spend: c.spend + s.spend, carbon: c.carbon + s.carbon });
  }
  const breakdown = make("ul", "rec-total-breakdown");
  breakdown.setAttribute("aria-label", "Savings by category");
  for (const [cat, c] of byCat) {
    const li = make("li", "");
    li.append(make("span", "", cat), make("b", "", money(c.spend)), make("span", "", carbonKg(c.carbon)));
    breakdown.append(li);
  }

  // two short lines rather than one long sentence, so they don't wrap in the narrow box
  const detail = make("div", "rec-total-detail");
  detail.append(
    make("span", "", `${share(spend / b.spend)} of your ${money(b.spend)} spending`),
    make("span", "", `${share(carbon / b.carbon)} of your carbon in ${monthName(ym)}`),
  );
  if (counted.length < rules.length) detail.append(make("span", "", "Flight savings aren't included because they depend on fares."));

  box.replaceChildren(
    make("span", "rec-saving-label",
      counted.length === 1 ? "If you follow the tip below you could save" : `If you follow all ${counted.length} tips below you could save`),
    figures,
    breakdown,
    detail,
  );
}

/* 6. Personas ------------------------------------------------------------ */

// persona picker, same idea as the dashboard
const personaBtn = $("persona-btn");
const personaMenu = $("persona-menu");

// updates the header, footer and links for the persona the server session is signed in as
function showPersona(id) {
  const p = state.personas.find(x => x.customerId === id);
  if (!p) return;
  state.customerId = id;
  try { sessionStorage.setItem(STORAGE_KEY, id); } catch {}
  personaBtn.textContent = `Example: ${p.persona}`;
  $("persona-footer").textContent = p.persona;
  $("add-link").href = `/spending-form/form.html?customer=${id}`;
  $("home-link").href = `/dashboard/dash.html?customer=${id}`;
  personaMenu.querySelectorAll(".dropdown-item").forEach(b => {
    const on = +b.dataset.id === id;
    b.classList.toggle("active", on);
    b.setAttribute("aria-current", on);
  });
}

// switching persona signs the session in as them first, otherwise /entries keeps returning the old one
personaMenu.addEventListener("click", async e => {
  const b = e.target.closest(".dropdown-item");
  if (!b || +b.dataset.id === state.customerId) return;
  try {
    await startSession(+b.dataset.id);
  } catch {
    return showError("Couldn't switch persona. Is the API running?");
  }
  showPersona(+b.dataset.id);
  state.selected = null;
  history.replaceState(null, "", location.pathname);
  loadEntries();
});


/* 7. Start up ------------------------------------------------------------ */

async function init() {
  try {
    state.personas = await getJSON("/personas");
    if (!state.personas.length) throw new Error("no personas");
  } catch {
    personaBtn.textContent = "Example: unavailable";
    return showError("Could not load personas from the server. Is the API running?");
  }
  personaMenu.replaceChildren(...state.personas.map(p => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dropdown-item";
    b.dataset.id = p.customerId;
    b.textContent = p.persona;
    li.appendChild(b);
    return li;
  }));

  // which persona: whoever the server session says, else the last one picked, else the first
  let id = null;
  try {
    const res = await fetch("/session");
    if (res.ok) id = (await res.json()).customerId;
    else if (res.status !== 401) throw new Error(res.status);
    if (id === null) {
      let stored = null;
      try { stored = Number(sessionStorage.getItem(STORAGE_KEY)); } catch {}
      const pick = state.personas.some(p => p.customerId === stored) ? stored : state.personas[0].customerId;
      id = (await startSession(pick)).customerId;
    }
  } catch {
    return showError("Could not reach the server. Is the API running?");
  }

  showPersona(id);
  await loadEntries();
}

// coming back with the browser's Back button: pick up anything added or edited meanwhile
window.addEventListener("pageshow", e => { if (e.persisted && state.customerId !== null) loadEntries(); });

init();