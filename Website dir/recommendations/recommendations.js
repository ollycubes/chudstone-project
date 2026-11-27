/* ==========================================================================
   Ways to save

     GET  /personas    persona picker
     GET  /session     who the server session is signed in as
     POST /session     switch persona (the demo "login")
     GET  /entries     every saved entry for the signed-in persona

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

// rounded to the penny (and 0.01 kg), so totals always equal the figures shown on each row
const round2 = n => Math.round(n * 100) / 100;

// the sheet's monthly saving for some spend, or null when it can't be worked out monthly (Airplane)
function savingFor(rule, spend) {
  if (rule.perTrip) return null;
  const r = netRates(rule);
  return { spend: round2(spend * r.spend), carbon: round2(spend * r.carbon) };
}

/* Best-month cap (prototype)
   The sheet's saving is a fixed share of what you spent. With the cap on, it's limited to how far
   this month is above your own best (lowest) month for that subcategory in the past 12 months:
   we never claim more than you've already shown you can do. Carbon is scaled down in proportion.
   It only applies once there are at least 3 earlier months to compare against.
   Known weakness: seasonal bills (Heating, Electricity) are compared across seasons. */
const CAP_AT_BEST_MONTH = true;
const CAP_LOOKBACK_MONTHS = 12;
const CAP_MIN_HISTORY = 3;

// your lowest spend on a subcategory in the months before ym, or null without enough history
function bestMonth(sub, ym) {
  const i = state.months.indexOf(ym);
  const earlier = state.months.slice(Math.max(0, i - CAP_LOOKBACK_MONTHS), Math.max(0, i))
    .map(m => ({ ym: m, spend: state.byMonth[m]?.bySub[sub] ?? 0 }))
    .filter(x => x.spend > 0);
  if (earlier.length < CAP_MIN_HISTORY) return null;
  return earlier.reduce((lo, x) => (x.spend < lo.spend ? x : lo));
}

// the saving shown for a tip in a month: the sheet's figure, capped at your best month when that's lower.
// Returns null for tips without a monthly figure. `capped` and `best` explain the figure on the row.
function monthSaving(rule, ym) {
  const spend = state.byMonth[ym]?.bySub[rule.subcategory] ?? 0;
  const sheet = savingFor(rule, spend);
  if (!sheet) return null;
  const best = CAP_AT_BEST_MONTH ? bestMonth(rule.subcategory, ym) : null;
  const gap = best ? Math.max(0, spend - best.spend) : Infinity;
  if (gap >= sheet.spend) return { ...sheet, sheet, best, capped: false };
  return {
    spend: round2(gap),
    carbon: round2(sheet.carbon * (gap / sheet.spend)),
    sheet, best, capped: true,
  };
}

// When is a tip worth doing? If it saves at least £1 a month OR at least 0.5 kg CO₂e a month.
// Tips under both limits aren't hidden: they go in a collapsed "Smaller wins" section under the list.
// Checked against the example data (6 personas × 12 months) this moves about 1 in 6 tips there,
// mostly Water and small months of Electricity, Bus, Carshare and Subway. Change these to tune it.
const MIN_SAVING_GBP = 1;
const MIN_SAVING_KG = 0.5;

const state = {
  customerId: null,
  personas: [],
  byMonth: {},        // "2026-10" -> { spend, carbon, bySub: { "Bus": 35.52, … } }
  months: [],         // every month from the first to the latest, gaps included
  selected: null,     // the month the recommendations are for
  rows: [],           // the tips for the selected month: { rule, spend, s (saving), small, li }
  picked: new Set(),  // subcategories whose tip is ticked ("Your plan"), remembered per persona
  view: "history",    // graph view: "history" or "projection" (Next 12 months)
  proj: null,         // the Next 12 months figures, for the tooltip
};

// the plan is saved in this browser per persona, so ticks survive a reload or a change of month
const planKey = () => `capstone.plan.${state.customerId}`;
function loadPlan() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(planKey())) || []; } catch {}
  state.picked = new Set(saved);
}
function savePlan() {
  try { localStorage.setItem(planKey(), JSON.stringify([...state.picked])); } catch {}
}

const $ = id => document.getElementById(id);


/* 2. Calculations  ------------------------------- */

const money = n => "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// savings are often under 1 kg, so they use two decimals (0.14 kg rather than 0.1 kg)
const kg = (n, dp = 1) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + " kg CO₂e";
const kg2 = n => kg(n, 2);
const tick = n => Number(n.toFixed(2)).toLocaleString("en-GB");

function monthName(ym) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function monthShort(ym, withYear) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", withYear ? { month: "short", year: "2-digit" } : { month: "short" });
}

function addMonths(ym, k) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + k);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// every month from first to last, so a month with no entries still appears (as a gap)
function monthRange(first, last) {
  const out = [];
  for (let ym = first; ym <= last; ym = addMonths(ym, 1)) out.push(ym);   // "YYYY-MM" sorts as text
  return out;
}

// adds up the entries into totals for each month (each entry is counted exactly once)
function aggregate(entries) {
  const byMonth = {};
  for (const e of entries) {
    const b = (byMonth[e.month] ||= { spend: 0, carbon: 0, bySub: {} });
    b.spend += e.amount;
    b.carbon += e.carbonKg;
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

// a tip applies when its subcategory has spending that month and (from the sheet) both net
// savings are positive. Airplane has no monthly figure, so it applies whenever there's flight spend.
function relevantRules(b) {
  return RULES.filter(rule => {
    if (!(b.bySub[rule.subcategory] > 0)) return false;
    const s = savingFor(rule, b.bySub[rule.subcategory]);
    return s === null || (s.spend > 0 && s.carbon > 0);
  });
}

// worth doing (main list) or a smaller win (collapsed section); see MIN_SAVING_GBP / MIN_SAVING_KG
const isSmallWin = s => s !== null && s.spend < MIN_SAVING_GBP && s.carbon < MIN_SAVING_KG;


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
  let entries = [];
  try {
    entries = await getJSON("/entries");
    clearError();
  } catch {
    showError("Couldn't load your spending. Is the API running?");
  }
  state.byMonth = aggregate(entries);
  const used = Object.keys(state.byMonth).sort();
  state.months = used.length ? monthRange(used[0], used[used.length - 1]) : [];
  if (!state.months.includes(state.selected)) state.selected = used[used.length - 1] || null;
  renderRecs();   // also draws the graph
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

/* The graph has two views, switched by the "History | Next 12 months" buttons above it:
     History          spending and carbon for each month you've entered (select a month here)
     Next 12 months   what the savings in the summary box add up to over the coming year,
                      month by month: all tips, or just the ticked ones */
const PROJECTION_MONTHS = 12;

// the savings the summary box shows: every tip, or just the ticked ones
function planSaving() {
  const rows = state.rows;
  if (!rows.length) return null;
  const picked = rows.filter(isPicked);
  const t = sumSavings(picked.length ? picked : rows);
  return { spend: t.spend, carbon: t.carbon, planning: picked.length > 0, count: picked.length || rows.length };
}

// running totals for the next 12 months, starting the month after your latest one
function projection() {
  const plan = planSaving();
  if (!plan || !(plan.spend > 0)) return null;
  const last = state.months[state.months.length - 1];
  const k = Array.from({ length: PROJECTION_MONTHS }, (_, i) => i + 1);
  return {
    plan,
    months: k.map(i => addMonths(last, i)),
    spend: k.map(i => round2(plan.spend * i)),
    carbon: k.map(i => round2(plan.carbon * i)),
  };
}
const tipsPhrase = plan => plan.planning
  ? `your ${plan.count} chosen ${plan.count === 1 ? "tip" : "tips"}`
  : plan.count === 1 ? "this tip" : `all ${plan.count} tips`;

// shared drawing helpers
function chartFrame(ticksLeft, ticksRight) {
  const W = plot.clientWidth, H = plot.clientHeight;
  if (!W || !H) return null;
  const m = {
    top: 10,
    bottom: 28,
    left: Math.max(...ticksLeft.map(t => t.length)) * 6.5 + 14,
    right: ticksRight ? Math.max(...ticksRight.map(t => t.length)) * 6.5 + 14 : 16,
  };
  const innerW = W - m.left - m.right, innerH = H - m.top - m.bottom;
  return innerW > 0 ? { W, H, m, innerW, innerH } : null;
}
function drawGrid(svg, f, ticksLeft, ticksRight) {
  const { W, m, innerH } = f;
  for (let k = 0; k <= 4; k++) {
    const y = m.top + innerH * (1 - k / 4);
    if (k) svg.append(svgEl("line", { class: "grid", x1: m.left, x2: W - m.right, y1: y, y2: y }));
    svg.append(svgEl("text", { x: m.left - 8, y, "text-anchor": "end", "dominant-baseline": "middle" }, ticksLeft[k]));
    if (ticksRight) svg.append(svgEl("text", { x: W - m.right + 8, y, "text-anchor": "start", "dominant-baseline": "middle" }, ticksRight[k]));
  }
  svg.append(svgEl("path", { class: "axis", d: `M${m.left} ${m.top}V${m.top + innerH}H${W - m.right}${ticksRight ? `V${m.top}` : ""}` }));
}
function drawMonthLabels(svg, f, months, band, xAt, sel) {
  const n = months.length;
  const multiYear = months[0].slice(0, 4) !== months[n - 1].slice(0, 4);
  const every = Math.max(1, Math.ceil((multiYear ? 54 : 36) / band));
  months.forEach((ym, i) => {
    if ((n - 1 - i) % every) return;
    svg.append(svgEl("text", { class: i === sel ? "month sel" : "month", x: xAt(i), y: f.m.top + f.innerH + 18, "text-anchor": "middle" }, monthShort(ym, multiYear)));
  });
}

// draws whichever view is chosen
function renderChart() {
  const hasData = state.months.length > 0;
  $("history-chart").classList.toggle("d-none", !hasData);
  $("history-empty").classList.toggle("d-none", hasData);
  plot.replaceChildren();
  hideTip();
  if (!hasData) return;

  const projecting = state.view === "projection";
  $("legend").classList.toggle("d-none", projecting);
  $("proj-head").classList.toggle("d-none", !projecting);
  document.querySelectorAll(".view-toggle button").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === state.view));
  projecting ? renderProjection() : renderHistory();
}

function renderHistory() {
  $("chart-summary").textContent = "";
  const n = state.months.length;
  const spend = state.months.map(ym => state.byMonth[ym]?.spend ?? null);
  const carbon = state.months.map(ym => state.byMonth[ym]?.carbon ?? null);
  const S = axisScale(Math.max(...spend.filter(v => v !== null)));
  const C = axisScale(Math.max(...carbon.filter(v => v !== null)));
  const sTicks = [0, 1, 2, 3, 4].map(k => "£" + tick(S.step * k));
  const cTicks = [0, 1, 2, 3, 4].map(k => tick(C.step * k) + " kg");

  const f = chartFrame(sTicks, cTicks);
  if (!f) return;
  const { W, H, m, innerW, innerH } = f;
  const band = innerW / n;
  const xAt = i => m.left + band * (i + 0.5);
  const yAt = (v, axis) => m.top + innerH * (1 - v / axis.top);
  const sel = state.months.indexOf(state.selected);
  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Spending and carbon by month" });

  if (sel >= 0) svg.append(svgEl("rect", { class: "sel-band", x: m.left + band * sel, y: m.top, width: band, height: innerH }));
  drawGrid(svg, f, sTicks, cTicks);
  drawMonthLabels(svg, f, state.months, band, xAt, sel);

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

// "Next 12 months": a column per month showing the running total saved by then
function renderProjection() {
  const p = state.proj = projection();
  const head = $("proj-head");
  if (!p) {
    head.textContent = "Select a month with savings on the History view to see what they'd add up to.";
    $("chart-summary").textContent = "";
    return;
  }
  const end = p.months[p.months.length - 1];
  head.replaceChildren(
    `With ${tipsPhrase(p.plan)} you'd save about `,
    make("b", "proj-money", money(p.spend[p.spend.length - 1])),
    " and ",
    make("b", "proj-carbon", kg(p.carbon[p.carbon.length - 1])),
    ` by ${monthName(end)}`,
    make("span", "proj-basis", `${money(p.plan.spend)} and ${kg(p.plan.carbon)} a month, based on ${monthName(state.selected)}`),
  );
  $("chart-summary").textContent = head.textContent;

  const top = p.spend[p.spend.length - 1], topKg = p.carbon[p.carbon.length - 1];
  const A = axisScale(top), K = axisScale(topKg);
  const ticks = [0, 1, 2, 3, 4].map(k => "£" + tick(A.step * k));
  const kTicks = [0, 1, 2, 3, 4].map(k => tick(K.step * k) + " kg");
  const f = chartFrame(ticks, kTicks);
  if (!f) return;
  const { W, H, m, innerW, innerH } = f;
  const n = p.months.length;
  const band = innerW / n;
  const xAt = i => m.left + band * (i + 0.5);
  const yAt = (v, axis = A) => m.top + innerH * (1 - v / axis.top);
  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Savings building up over the next 12 months" });

  drawGrid(svg, f, ticks, kTicks);
  drawMonthLabels(svg, f, p.months, band, xAt, -1);

  // a pair of columns per month: money (left axis) and carbon (right axis)
  const gw = Math.min(band * 0.72, 46), bw = gw / 2 - 1.5;
  const bar = (v, axis, cls, i, dx) => {
    const y = yAt(v, axis);
    svg.append(svgEl("rect", { class: `proj-bar ${cls}${i === n - 1 ? " last" : ""}`, x: xAt(i) + dx, y, width: bw, height: m.top + innerH - y, rx: 2 }));
  };
  p.months.forEach((_, i) => {
    bar(p.spend[i], A, "spend", i, -gw / 2);
    bar(p.carbon[i], K, "carbon", i, 1.5);
  });
  // the year's totals, stacked above the last pair of columns
  const yTop = Math.min(yAt(top), yAt(topKg, K));
  const rx = xAt(n - 1) + gw / 2;
  svg.append(
    svgEl("text", { class: "proj-total spend", x: rx, y: yTop - 22, "text-anchor": "end" }, money(top)),
    svgEl("text", { class: "proj-total carbon", x: rx, y: yTop - 8, "text-anchor": "end" }, kg(topKg)),
  );

  p.months.forEach((ym, i) => {
    svg.append(svgEl("rect", {
      class: "hit proj", x: m.left + band * i, y: m.top, width: band, height: innerH + m.bottom,
      tabindex: 0, role: "img", "data-month": ym, "data-proj": i,
      "aria-label": `By ${monthName(ym)}: ${money(p.spend[i])} and ${kg(p.carbon[i])} saved.`,
    }));
  });
  plot.append(svg);
}

function selectMonth(ym) {
  if (ym === state.selected) return;
  const hadFocus = document.activeElement?.classList.contains("hit");
  state.selected = ym;
  renderRecs();   // also draws the graph
  if (hadFocus) plot.querySelector(`.hit[data-month="${ym}"]`)?.focus();
}

// tooltip for the month under the pointer (or keyboard focus)
function showTip(hit, x, y) {
  const ym = hit.dataset.month, projIndex = hit.dataset.proj;
  const b = projIndex !== undefined ? null : state.byMonth[ym];
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

  if (projIndex !== undefined) {
    const p = state.proj, i = Number(projIndex);
    head.textContent = `By ${monthName(ym)}`;
    const note = document.createElement("span");
    note.className = "tip-note";
    note.textContent = `Saved with ${tipsPhrase(p.plan)}`;
    tip.replaceChildren(head, row("spend", "Money", money(p.spend[i])), row("carbon", "Carbon", kg(p.carbon[i])), note);
  } else if (b) {
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
  if (hit) showTip(hit, e.clientX, e.clientY); else hideTip();
});
plot.addEventListener("mouseleave", hideTip);
plot.addEventListener("focusin", e => {
  const hit = e.target.closest(".hit");
  if (!hit) return hideTip();
  const r = hit.getBoundingClientRect();
  showTip(hit, r.left + r.width / 2, r.top + 24);
});
plot.addEventListener("focusout", hideTip);
plot.addEventListener("click", e => {
  const hit = e.target.closest(".hit");
  if (hit && hit.dataset.proj === undefined) selectMonth(hit.dataset.month);   // projected months can't be selected
});
plot.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("hit") && e.target.dataset.proj === undefined) {
    e.preventDefault();
    selectMonth(e.target.dataset.month);
  }
});

new ResizeObserver(renderChart).observe(plot);

document.querySelectorAll(".view-toggle button").forEach(b => b.addEventListener("click", () => {
  state.view = b.dataset.view;
  renderChart();
}));


/* 5. Recommendations ----------------------------------------------------- */

const recsPanel = $("recs");
const recList = $("rec-list");
const smallList = $("rec-list-small");   // "Smaller wins": tips under the minimum saving
$("rec-small-why").textContent = `Each saves under ${money(MIN_SAVING_GBP)} and ${MIN_SAVING_KG} kg CO₂e a month`;

// small helper for building the cards and the total
function make(tag, cls, text) {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// builds one row of the recommendations list:
//   left   the tip, then its category, subcategory and what was spent there
//   right  what it saves a month, in £ and kg CO₂e, lined up under the column headings
// screen readers hear e.g. "… Could save £7.74 and 4.26 kg CO₂e a month"
function recCard({ rule, spend, s }, i) {
  const li = make("li", "rec");
  li.dataset.sub = rule.subcategory;

  // tick to add this tip to "Your plan"; the tip text is its label (ticks are set by renderPlan)
  const box = make("input", "form-check-input rec-check");
  box.type = "checkbox";
  box.setAttribute("aria-labelledby", `rec-action-${i}`);
  box.setAttribute("aria-describedby", `rec-meta-${i} rec-figs-${i}`);

  const main = make("div", "rec-main");
  const meta = make("p", "rec-meta");
  meta.append(
    make("span", `rec-dot cat-${rule.category.toLowerCase()}`),
    make("span", "rec-cat", rule.category),
    make("span", "rec-sep", "·"),
    make("span", "", rule.subcategory),
    make("span", "rec-sep", "·"),
    make("span", "", `${money(spend)} spent`),
  );
  meta.querySelectorAll(".rec-dot, .rec-sep").forEach(n => n.setAttribute("aria-hidden", "true"));
  const action = make("p", "rec-action", rule.action);
  action.id = `rec-action-${i}`;
  meta.id = `rec-meta-${i}`;
  main.append(action, meta);

  // when the cap lowered the figure, say so and show the month it's based on
  if (s?.capped) {
    const why = s.spend > 0
      ? `Limited to your best recent month: ${money(s.best.spend)} in ${monthName(s.best.ym)} (the sheet suggests ${money(s.sheet.spend)})`
      : `You're already at or below your best recent month: ${money(s.best.spend)} in ${monthName(s.best.ym)}`;
    main.append(make("p", "rec-capped", why));
  }

  const figs = make("div", "rec-figs");
  figs.id = `rec-figs-${i}`;
  if (s?.capped && s.spend === 0) {
    figs.classList.add("muted");
    figs.append(make("span", "rec-fig-note", "Keep it up: no further saving expected from this tip"));
  } else if (s) {
    figs.append(
      make("span", "visually-hidden", "Could save "),
      make("span", "rec-fig rec-fig-money", money(s.spend)),
      make("span", "visually-hidden", " and "),
      make("span", "rec-fig rec-fig-carbon", kg2(s.carbon)),
      make("span", "rec-fig-per", " a month"),
    );
  } else {
    figs.classList.add("muted");
    figs.append(make("span", "rec-fig-note", "Depends on the flight and train fares for your trip"));
  }

  li.append(box, main, figs);
  return li;
}

// works out which recommendations to show for the selected month and fills the list
function renderRecs() {
  const ym = state.selected;
  const b = ym ? state.byMonth[ym] : null;

  // each tip's saving is worked out once here and reused by the list, the summary and the graph.
  // Biggest £ saving first; tips without a monthly figure (Airplane) go last.
  state.rows = (b ? relevantRules(b) : [])
    .map(rule => {
      const s = monthSaving(rule, ym);
      return { rule, spend: b.bySub[rule.subcategory], s, small: isSmallWin(s) };
    })
    .sort((x, y) => (y.s?.spend ?? -1) - (x.s?.spend ?? -1));
  const main = state.rows.filter(x => !x.small), small = state.rows.filter(x => x.small);
  [...main, ...small].forEach((x, i) => { x.li = recCard(x, i); });
  recList.replaceChildren(...main.map(x => x.li));
  smallList.replaceChildren(...small.map(x => x.li));
  recList.classList.toggle("d-none", !main.length);
  $("rec-small").classList.toggle("d-none", !small.length);
  $("rec-small-none").classList.toggle("d-none", main.length > 0 || !small.length);
  renderPlan();    // ticks, the count by the heading and the summary box
  renderChart();

  // one line under the heading says the month once, instead of on every row
  const n = (k, word) => `${k} ${word}${k === 1 ? "" : "s"}`;
  $("recs-sub").textContent = state.rows.length
    ? `${n(main.length, "tip")} based on your ${monthName(ym)} spending, biggest saving first.` +
      (small.length ? ` ${n(small.length, "smaller win")} below.` : "") +
      (CAP_AT_BEST_MONTH ? " Savings never go beyond what you managed in your best month of the past year." : "")
    : "";
  $("rec-cols").classList.toggle("d-none", !state.rows.length);

  // no month at all, a month with no entries (a gap), or a month where no rule applies
  const text = !ym ? "No spending yet. Add a month to get recommendations."
    : !b ? `No spending recorded in ${monthName(ym)}.`
    : state.rows.length ? ""
    : `Nothing to suggest for ${monthName(ym)} yet.`;
  const empty = $("rec-empty");
  empty.textContent = text;
  empty.classList.toggle("d-none", !text);
  $("add-link").classList.toggle("d-none", state.months.length > 0);
}

/* Ticking tips ("Your plan")
   Tick the tips you'll use. The summary box beside the graph shows the most you could save
   until something is ticked, then switches to the total for just the ticked tips.
   Each tip is about a different subcategory, so savings never overlap and simply add up. */

const isPicked = x => state.picked.has(x.rule.subcategory);

// adds up a set of rows; tips without a monthly figure (Airplane) are counted separately
function sumSavings(rows) {
  const counted = rows.filter(x => x.s);
  return {
    counted,
    spend: counted.reduce((t, x) => t + x.s.spend, 0),
    carbon: counted.reduce((t, x) => t + x.s.carbon, 0),
    flights: rows.length - counted.length,
  };
}

// after any change: ticks and highlights, the select-all box, the count by the heading, the summary
function renderPlan() {
  const rows = state.rows;
  const picked = rows.filter(isPicked);
  rows.forEach(x => {
    x.li.classList.toggle("picked", isPicked(x));
    x.li.querySelector(".rec-check").checked = isPicked(x);
  });

  const all = $("pick-all");
  all.checked = rows.length > 0 && picked.length === rows.length;
  all.indeterminate = picked.length > 0 && picked.length < rows.length;

  // "Smaller wins (2)", plus how many of those are ticked, since the section may be closed
  const smallRows = rows.filter(x => x.small);
  const smallPicked = smallRows.filter(isPicked).length;
  $("rec-small-title").textContent = `Smaller wins (${smallRows.length})` + (smallPicked ? ` · ${smallPicked} selected` : "");

  // small reminder by the heading, for when the summary box is scrolled out of view
  const t = sumSavings(picked);
  const count = $("recs-count");
  count.classList.toggle("d-none", !picked.length);
  count.textContent = picked.length ? `${picked.length} selected · ${money(t.spend)} / month` : "";

  renderTotal();
}

// tells screen reader users what the new total is (only when they tick, not on every redraw)
function announcePlan() {
  const picked = state.rows.filter(isPicked), t = sumSavings(picked);
  $("plan-status").textContent = picked.length
    ? `Your plan: ${picked.length} ${picked.length === 1 ? "tip" : "tips"}, saving ${money(t.spend)} and ${kg2(t.carbon)} a month.`
    : "No tips selected. The summary shows the most you could save.";
}

// after any tick: save, update the page, tell screen readers, and redraw Next 12 months if it's showing
function planChanged() {
  savePlan();
  renderPlan();
  announcePlan();
  if (state.view === "projection") renderChart();
}

function setPicked(rows, on) {
  rows.forEach(x => on ? state.picked.add(x.rule.subcategory) : state.picked.delete(x.rule.subcategory));
  planChanged();
}

// both lists live in the panel, so one set of handlers covers them
recsPanel.addEventListener("change", e => {
  const box = e.target.closest(".rec .rec-check");   // a row's box (select-all has its own handler)
  if (!box) return;
  const sub = box.closest(".rec").dataset.sub;
  box.checked ? state.picked.add(sub) : state.picked.delete(sub);
  planChanged();
});
// clicking anywhere on a row ticks it, not just the small box
recsPanel.addEventListener("click", e => {
  if (e.target.closest(".rec-check")) return;
  e.target.closest(".rec")?.querySelector(".rec-check").click();
});
$("pick-all").addEventListener("change", e => setPicked(state.rows, e.target.checked));


/* Summary box (beside the graph)
   Nothing ticked: "If you follow all 8 tips below you could save £29.83"
   Some ticked:    "Your plan · 3 of 8 tips saves £15.10 … out of £29.83 possible" */
function renderTotal() {
  const box = $("rec-total");
  const ym = state.selected, b = ym ? state.byMonth[ym] : null;
  box.classList.toggle("d-none", !b);           // no month at all: the recommendations panel explains why
  if (!b) return box.replaceChildren();

  const rows = state.rows;
  const picked = rows.filter(isPicked);
  const planning = picked.length > 0;
  const all = sumSavings(rows);
  const t = planning ? sumSavings(picked) : all;
  if (!planning && !all.counted.length) {
    return box.replaceChildren(make("span", "rec-total-detail", `No savings to add up for ${monthName(ym)} yet.`));
  }

  const label = planning
    ? `Your plan · ${picked.length} of ${rows.length} tips saves`
    : rows.length === 1 ? "If you follow the tip below you could save" : `If you follow all ${rows.length} tips below you could save`;

  // headline: the total
  const figures = make("div", "rec-total-figures");
  figures.append(
    make("span", "rec-money", money(t.spend)),
    make("span", "visually-hidden", " and "),
    make("span", "rec-carbon", kg2(t.carbon)),
    make("span", "rec-per", planning ? `a month, out of ${money(all.spend)} possible` : "a month"),
  );

  // where it comes from: one line per category (Travel, Food, Utilities)
  const breakdown = make("ul", "rec-total-breakdown");
  breakdown.setAttribute("aria-label", "Savings by category");
  for (const cat of [...new Set(RULES.map(r => r.category))]) {
    const inCat = t.counted.filter(x => x.rule.category === cat);
    if (!inCat.length) continue;
    const c = sumSavings(inCat);
    const li = make("li", "");
    li.append(make("span", "", cat), make("b", "", money(c.spend)), make("span", "", kg2(c.carbon)));
    breakdown.append(li);
  }

  // two short lines rather than one long sentence, so they don't wrap in the narrow box
  const share = n => (n * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "%";
  const detail = make("div", "rec-total-detail");
  detail.append(
    make("span", "", `${share(t.spend / b.spend)} of your ${money(b.spend)} spending`),
    make("span", "", `${share(t.carbon / b.carbon)} of your carbon in ${monthName(ym)}`),
  );
  if (t.flights) detail.append(make("span", "", "Flight savings aren't included because they depend on fares."));

  const actions = make("div", "rec-total-actions");
  if (planning) {
    const clear = make("button", "rec-total-clear", "Clear selection");
    clear.type = "button";
    clear.addEventListener("click", () => setPicked(rows, false));
    actions.append(clear);
  }
  actions.append(jumpLink(rows.length, planning));

  box.replaceChildren(make("span", "rec-saving-label", label), figures, breakdown, detail, actions);
}

// button at the bottom of the summary that takes you down to the tips.
// It's a real link to #recs, so it still works without JavaScript; with it, it scrolls smoothly
// and moves keyboard focus to the Recommendations heading.
function jumpLink(count, planning) {
  const text = planning ? "Change your tips" : count === 1 ? "See the recommendation" : `See all ${count} recommendations`;
  const a = make("a", "rec-total-jump", text);
  a.href = "#recs";
  const arrow = make("span", "rec-total-jump-arrow", "↓");
  arrow.setAttribute("aria-hidden", "true");
  a.append(arrow);
  a.addEventListener("click", e => {
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    recsPanel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    $("recs-title").focus({ preventScroll: true });
  });
  return a;
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
  loadPlan();
  try { sessionStorage.setItem(STORAGE_KEY, id); } catch {}
  personaBtn.textContent = `Example: ${p.persona}`;
  $("persona-footer").textContent = p.persona;
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