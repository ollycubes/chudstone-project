/* ==========================================================================
   Ways to save

     GET /personas                 persona picker
     GET /entries?customer_id=     every saved entry for the persona

   ========================================================================== */

/* 1. Rules and state ----------------------------------------------------- */

const STORAGE_KEY = "capstone.customerId";

const RULES = [
  { category: "Travel", subcategory: "Self-owned car", action: "Walk or cycle a nearby errand you’d normally drive to, or combine two errands into one drive." },
  { category: "Travel", subcategory: "Motorbike", action: "Walk a short errand you’d normally ride to, or group two stops into one ride." },
  { category: "Travel", subcategory: "Bus", action: "Walk or cycle a short trip you’d normally pay a bus fare for, if the route suits you." },
  { category: "Travel", subcategory: "Train", action: "Put two visits on the same day so you can make one train trip and avoid buying a separate ticket." },
  { category: "Travel", subcategory: "Taxi", action: "Walk a short journey you’d normally take by taxi, if the route suits you." },
  { category: "Travel", subcategory: "Airplane", action: "Compare a train with a flight for an upcoming trip where both options work for you." },
  { category: "Travel", subcategory: "Subway", action: "Walk or cyclea short journey, if it’s convenient and would lower the fare you pay." },
  { category: "Travel", subcategory: "Carshare", action: "Plan two shared errands for the same drive, so the car makes one fewer trip." },
  { category: "Food", subcategory: "Groceries", action: "Check your cupboards before shopping and plan one meal around food you already have." },
  { category: "Food", subcategory: "Delivery", action: "Batch-cook an extra portion for a night you’d usually order a delivery." },
  { category: "Food", subcategory: "Restaurant/Dine out", action: "Swap one planned meal out for a home-cooked meal." },
  { category: "Utilities", subcategory: "Electricity", action: "Air-dry a few loads you’d normally tumble-dry." },
  { category: "Utilities", subcategory: "Water", action: "Try slightly reduce shower time on several days each week." },
  { category: "Utilities", subcategory: "Heating", action: "Check the timer for a regular period when the home is empty." },
];

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
function relevantRules(b) {
  return RULES.filter(rule =>
    b.byCat[rule.category] > CATEGORY_THRESHOLD[rule.category] && b.bySub[rule.subcategory] > 0);
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

// builds one recommendation card
function recCard(rule, ym, spend) {
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const li = make("li", "rec");
  li.dataset.sub = rule.subcategory;

  const body = make("div", "rec-body");
  body.append(
    make("span", "rec-tag", `${rule.category} · ${rule.subcategory}`),
    make("span", "rec-action", rule.action),
    make("span", "rec-basis", `Based on ${money(spend)} spent on ${rule.subcategory} in ${monthName(ym)}`),
  );

  li.append(body);
  return li;
}

// works out which recommendations to show for the selected month and fills the list
function renderRecs() {
  const ym = state.selected;
  const b = ym ? state.byMonth[ym] : null;
  const rules = b ? relevantRules(b) : [];

  $("recs-note").textContent = ym
    ? `Based on your spending in ${monthName(ym)}. ${state.months.length > 1 ? "Select a month on the graph to change it." : ""}`
    : "";
  recList.replaceChildren(...rules.map(r => recCard(r, ym, b.bySub[r.subcategory])));

  empty.classList.toggle("d-none", !text);
  $("add-link").classList.toggle("d-none", state.months.length > 0);
}


/* 6. Personas ------------------------------------------------------------ */

const personaBtn = $("persona-btn");
const personaMenu = $("persona-menu");

// server remebers who we r , GET /entries then returns only that persona's spending
async function startSession(id) {
  const body = new FormData();
  body.append("customer_id", id);
  const res = await fetch("/session", { method: "POST", body });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}
// updates page to show new selected persons id
function setPersona(id, { reload = true } = {}) {
  const p = state.personas.find(x => x.customerId === id);
  if (!p) return;
  const changed = state.customerId !== id;
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
  // reload the entries if the persona changed
  if (reload && changed) {
    state.selected = null;
    history.replaceState(null, "", location.pathname);
    loadEntries();
  }
}

personaMenu.addEventListener("click", async e => {
  const b = e.target.closest(".dropdown-item");
  if (!b || +b.dataset.id === state.customerId) return;
  try {
    await startSession(+b.dataset.id);
  } catch {
    return showError("Couldn't switch persona. Is the API running?");
  }
  setPersona(+b.dataset.id);
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

  let stored = null;
  try { stored = sessionStorage.getItem(STORAGE_KEY); } catch {}
  const id = [new URLSearchParams(window.location.search).get("customer"), stored].map(Number)
    .find(n => state.personas.some(p => p.customerId === n)) ?? state.personas[0].customerId;

  setPersona(id, { reload: false });
  await loadEntries();
}

// coming back with the browser's Back button: pick up anything added or edited meanwhile
window.addEventListener("pageshow", e => { if (e.persisted && state.customerId !== null) loadEntries(); });

init();