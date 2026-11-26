
/* ==========================================================================
   Dashboard
   Data comes from the API:
     GET  /personas, /categories, /submissions/{id}   (existing)
     GET  /entries?customer_id=   every saved entry for the persona
     PUT  /entries/{id}           edit one entry (carbon is recalculated by the server)
   Everything on screen (chart, totals, insight cards, savings) is calculated from that one
   entries list by the small pure functions in section 2, so the numbers always agree.
   ========================================================================== */

/* 1. Constants and state ------------------------------------------------- */

const CAT_ORDER = ["Food", "Travel", "Utilities"];        // stack order (bottom to top) and legend order
const CAT_COLOUR = {
  Food: "var(--c-food)",
  Travel: "var(--c-travel)",
  Utilities: "var(--c-utilities)",
};
const FALLBACK_COLOUR = "var(--icon-colour)";             // a category the chart doesn't know about
const STORAGE_KEY = "capstone.customerId";

const state = {
  customerId: null,
  personas: [],
  categories: {},      // { Travel: ["Bus", ...], ... } from GET /categories
  entries: [],         // from GET /entries
  byMonth: {},         // month -> { spend: {cat: £}, carbon: {cat: kg}, count }
  months: [],          // every month from the first to the last with data (gaps included)
  cats: [],            // categories shown in the chart
  selected: null,      // "YYYY-MM"
  view: "spend",       // "spend" | "carbon"
};

const $ = id => document.getElementById(id);


/* 2. Calculations (pure functions, no DOM) ------------------------------- */

const money = n => "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = n => Number(n).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " kg CO₂e";
const fmt = (view, n) => (view === "spend" ? money(n) : kg(n));
const tick = (view, n) => (view === "spend" ? "£" : "") + Number(n.toFixed(2)).toLocaleString("en-GB");

const sum = obj => Object.values(obj).reduce((t, v) => t + v, 0);
const emptyBucket = () => ({ spend: {}, carbon: {}, count: 0 });

function monthName(ym) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function monthOnly(ym) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long" });
}
function monthShort(ym, withYear) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", withYear ? { month: "short", year: "2-digit" } : { month: "short" });
}

// every month from first to last, so a month with no entries still appears (as an empty bar)
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

// entries -> per-month, per-category totals. Each entry is counted exactly once.
function aggregate(entries) {
  const byMonth = {};
  for (const e of entries) {
    const b = (byMonth[e.month] ||= emptyBucket());
    b.spend[e.category] = (b.spend[e.category] || 0) + e.amount;
    b.carbon[e.category] = (b.carbon[e.category] || 0) + e.carbonKg;
    b.count++;
  }
  return byMonth;
}

const bucket = ym => state.byMonth[ym] || emptyBucket();

// the category with the biggest value in a { category: value } object, or null if nothing was spent
function topCategory(values) {
  const total = sum(values);
  let best = null;
  for (const [cat, v] of Object.entries(values)) if (v > 0 && (!best || v > best.value)) best = { cat, value: v };
  return best && { ...best, share: Math.round((best.value / total) * 100) };
}

// "nice" axis: a top value and step that give about four evenly spaced gridlines
function niceScale(max) {
  if (!(max > 0)) return { top: 1, step: 0.25 };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rough);
  return { top: Math.ceil(max / step - 1e-9) * step, step };
}

// Estimated saving for a month: how much less you would have spent (or emitted) if each category
// had matched your lowest month on record for that category. A category only counts if it appears
// in at least one other month, so a missing month is never read as "spend nothing".
// Returns null when there is nothing to compare against yet.
// This is the single place to swap in a different method once the recommendations feature exists.
function estimateSavings(ym, view) {
  const here = bucket(ym)[view];
  let saving = 0, compared = false;
  for (const [cat, value] of Object.entries(here)) {
    if (!(value > 0)) continue;
    const others = state.months
      .filter(m => m !== ym)
      .map(m => bucket(m)[view][cat])
      .filter(v => v > 0);
    if (!others.length) continue;
    compared = true;
    saving += Math.max(0, value - Math.min(...others));
  }
  return compared ? saving : null;
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
    state.entries = await getJSON(`/entries?${new URLSearchParams({ customer_id: state.customerId })}`);
    clearError();
  } catch {
    state.entries = [];
    showError("Couldn't load your spending. Is the API running?");
  }
  rebuild();
}

// recalculate everything derived from state.entries, then redraw
function rebuild() {
  state.byMonth = aggregate(state.entries);
  const used = Object.keys(state.byMonth).sort();
  state.months = used.length ? monthRange(used[0], used[used.length - 1]) : [];

  const found = new Set(state.entries.map(e => e.category));
  state.cats = [...CAT_ORDER, ...[...found].filter(c => !CAT_ORDER.includes(c)).sort()];

  if (!state.months.includes(state.selected)) state.selected = state.months[state.months.length - 1] || null;
  renderChart();
  renderPanel();
  renderInsights();
}


/* 4. Chart --------------------------------------------------------------- */

const chartEl = $("chart");
const barsEl = $("chart-bars");
const gridEl = $("chart-grid");
const tip = $("chart-tip");

function renderChart() {
  const view = state.view;
  const hasData = state.months.length > 0;
  chartEl.classList.toggle("d-none", !hasData);
  $("chart-empty").classList.toggle("d-none", hasData);
  $("chart-title").textContent = view === "spend" ? "Spending overview" : "Carbon overview";
  $("chart-ylabel").textContent = view === "spend" ? "Spending (£)" : "Carbon (kg CO₂e)";

  $("legend").replaceChildren(...state.cats.map(cat => {
    const li = document.createElement("li");
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.setProperty("--sw", CAT_COLOUR[cat] || FALLBACK_COLOUR);
    li.append(cat, sw);
    return li;
  }));

  barsEl.replaceChildren();
  gridEl.replaceChildren();
  hideTip();
  if (!hasData) return;

  const totals = state.months.map(m => sum(bucket(m)[view]));
  const { top, step } = niceScale(Math.max(...totals));

  for (let v = 0; v <= top + step / 1000; v += step) {
    const line = document.createElement("div");
    line.className = "grid-line";
    line.style.bottom = `${(v / top) * 100}%`;
    if (v === 0) line.style.borderTop = "0";
    const label = document.createElement("span");
    label.textContent = tick(view, v);
    line.appendChild(label);
    gridEl.appendChild(line);
  }

  const multiYear = state.months[0].slice(0, 4) !== state.months[state.months.length - 1].slice(0, 4);
  state.months.forEach((ym, i) => {
    const b = bucket(ym);
    const col = document.createElement("div");
    col.className = "bar-col";
    col.dataset.month = ym;
    col.setAttribute("role", "listitem");

    const area = document.createElement("div");
    area.className = "bar-area";
    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${(totals[i] / top) * 100}%`;
    for (const cat of state.cats) {
      const value = b[view][cat];
      if (!(value > 0)) continue;
      const seg = document.createElement("div");
      seg.className = "seg";
      seg.style.height = `${(value / totals[i]) * 100}%`;
      seg.style.setProperty("--seg", CAT_COLOUR[cat] || FALLBACK_COLOUR);
      seg.dataset.month = ym;
      seg.dataset.cat = cat;
      seg.tabIndex = 0;
      seg.setAttribute("role", "img");
      seg.setAttribute("aria-label", `${cat}, ${monthName(ym)}: ${fmt(view, value)}`);
      stack.appendChild(seg);
    }
    area.appendChild(stack);

    const label = document.createElement("button");
    label.type = "button";
    label.className = "bar-month";
    label.textContent = monthShort(ym, multiYear);
    label.setAttribute("aria-label", `Show ${monthName(ym)}`);
    label.style.cssText = "border:0;background:none;padding:0;color:inherit;font:inherit;";

    col.append(area, label);
    barsEl.appendChild(col);
  });

  $("chart-summary").textContent =
    `Stacked bar chart of ${view === "spend" ? "spending" : "carbon"} by category for ${state.months.length} month${state.months.length === 1 ? "" : "s"}.`;
  updateSelection();
}

// highlight the chosen month's bar without redrawing the chart
function updateSelection() {
  barsEl.querySelectorAll(".bar-col").forEach(col => {
    const on = col.dataset.month === state.selected;
    col.classList.toggle("selected", on);
    col.classList.toggle("dim", !on);
  });
}

function selectMonth(ym) {
  if (!state.months.includes(ym) || ym === state.selected) return;
  state.selected = ym;
  updateSelection();
  renderPanel();
  renderInsights();
}

// tooltip ---------------------------------------------------------------

function showTip(seg, x, y) {
  const { month, cat } = seg.dataset;
  const b = bucket(month);
  const other = state.view === "spend" ? "carbon" : "spend";
  const row = (cls, text) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; return s; };

  const head = row("tip-cat", "");
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.setProperty("--sw", CAT_COLOUR[cat] || FALLBACK_COLOUR);
  head.append(sw, cat);

  tip.replaceChildren(
    head,
    row("tip-main", fmt(state.view, b[state.view][cat])),
    row("tip-alt", fmt(other, b[other][cat])),
    row("tip-month", monthName(month)),
  );
  tip.hidden = false;

  const card = tip.offsetParent.getBoundingClientRect();
  let left = x - card.left + 14, topPos = y - card.top + 14;
  if (left + tip.offsetWidth > card.width - 8) left = x - card.left - tip.offsetWidth - 14;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${topPos}px`;
}
function hideTip() { tip.hidden = true; }

barsEl.addEventListener("mousemove", e => {
  const seg = e.target.closest(".seg");
  if (seg) showTip(seg, e.clientX, e.clientY); else hideTip();
});
barsEl.addEventListener("mouseleave", hideTip);
barsEl.addEventListener("focusin", e => {
  const seg = e.target.closest(".seg");
  if (!seg) return hideTip();
  const r = seg.getBoundingClientRect();
  showTip(seg, r.left + r.width / 2, r.top + r.height / 2);
});
barsEl.addEventListener("focusout", hideTip);

barsEl.addEventListener("click", e => {
  const col = e.target.closest(".bar-col");
  if (col) selectMonth(col.dataset.month);
});
barsEl.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("seg")) {
    e.preventDefault();
    selectMonth(e.target.dataset.month);
  }
});

// Spending / Carbon toggle
document.querySelectorAll(".view-btn").forEach(btn => btn.addEventListener("click", () => {
  if (btn.dataset.view === state.view) return;
  state.view = btn.dataset.view;
  document.querySelectorAll(".view-btn").forEach(b => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
  renderChart();
  renderInsights();
}));


/* 5. Month panel --------------------------------------------------------- */

// "£160 less than September" with a small arrow; less spending / carbon is the good direction
function setDelta(el, view, ym) {
  const idx = state.months.indexOf(ym);
  const prev = idx > 0 ? state.months[idx - 1] : null;
  el.replaceChildren();
  if (!prev || !state.byMonth[prev] || !state.byMonth[ym]) return;
  const now = sum(bucket(ym)[view]), before = sum(bucket(prev)[view]);
  const diff = Math.round((now - before) * 100) / 100;
  const icon = document.createElement("span");
  icon.className = "delta-icon";
  icon.setAttribute("aria-hidden", "true");
  if (diff === 0) {
    el.append(`Same as ${monthOnly(prev)}`);
    icon.textContent = "=";
    icon.classList.add("delta-flat");
  } else {
    const word = diff < 0 ? "less" : "more";
    el.append(`${fmt(view, Math.abs(diff))} ${word} than ${monthOnly(prev)}`);
    icon.textContent = diff < 0 ? "▼" : "▲";
    icon.classList.add(diff < 0 ? "delta-good" : "delta-bad");
  }
  el.appendChild(icon);
}

function renderPanel() {
  const ym = state.selected;
  const idx = state.months.indexOf(ym);
  $("month-prev").disabled = idx <= 0;
  $("month-next").disabled = idx < 0 || idx >= state.months.length - 1;

  if (!ym) {
    $("month-title").textContent = "No spending yet";
    $("total-spend").textContent = "–";
    $("total-carbon").textContent = "–";
    $("spend-delta").replaceChildren();
    $("carbon-delta").replaceChildren();
    $("entry-count").textContent = "Add a month to get started";
    return;
  }

  const b = bucket(ym);
  $("month-title").textContent = monthName(ym);
  if (b.count) {
    $("total-spend").textContent = money(sum(b.spend));
    $("total-carbon").textContent = kg(sum(b.carbon));
    $("entry-count").textContent = `Across ${b.count} ${b.count === 1 ? "entry" : "entries"}`;
  } else {                                           // a month between two others with nothing saved
    $("total-spend").textContent = "–";
    $("total-carbon").textContent = "–";
    $("entry-count").textContent = "No spending recorded this month";
  }
  setDelta($("spend-delta"), "spend", ym);
  setDelta($("carbon-delta"), "carbon", ym);
}

$("month-prev").addEventListener("click", () => selectMonth(state.months[state.months.indexOf(state.selected) - 1]));
$("month-next").addEventListener("click", () => selectMonth(state.months[state.months.indexOf(state.selected) + 1]));


/* 6. Insight cards ------------------------------------------------------- */

function setTop(valueId, subId, top, view, totalLabel) {
  const v = $(valueId);
  if (!top) {
    v.textContent = "–";
    v.removeAttribute("data-cat");
    $(subId).textContent = state.selected ? "Nothing recorded this month" : "";
    return;
  }
  v.textContent = top.cat;
  v.dataset.cat = top.cat;
  $(subId).textContent = `${fmt(view, top.value)} · ${top.share}% of ${totalLabel}`;
}

function renderInsights() {
  const b = state.selected ? bucket(state.selected) : emptyBucket();
  setTop("top-spend", "top-spend-sub", topCategory(b.spend), "spend", "total spending");
  setTop("top-carbon", "top-carbon-sub", topCategory(b.carbon), "carbon", "your footprint");

  // the savings card follows the chart's Spending / Carbon toggle
  const saving = state.selected ? estimateSavings(state.selected, state.view) : null;
  $("save-value").textContent = saving === null ? "–" : fmt(state.view, saving);
  $("save-sub").textContent =
    saving === null ? "Add another month to estimate savings"
    : saving === 0 ? "You're at your lowest in every category"
    : `estimated ${state.view === "spend" ? "savings" : "carbon savings"} this month, if each category matched your lowest month`;
}


/* 7. Personas ------------------------------------------------------------ */

const personaBtn = $("persona-btn");
const personaMenu = $("persona-menu");

function setPersona(id, { reload = true } = {}) {
  const p = state.personas.find(x => x.customerId === id);
  if (!p) return;
  const changed = state.customerId !== id;
  state.customerId = id;
  try { sessionStorage.setItem(STORAGE_KEY, id); } catch {}
  personaBtn.textContent = `Example: ${p.persona}`;
  $("persona-footer").textContent = p.persona;
  $("add-link").href = `/spending-form/form.html?customer=${id}`;
  personaMenu.querySelectorAll(".dropdown-item").forEach(b => {
    const on = +b.dataset.id === id;
    b.classList.toggle("active", on);
    b.setAttribute("aria-current", on);
  });
  if (reload && changed) {
    state.selected = null;
    history.replaceState(null, "", `?customer=${id}`);
    loadEntries();
  }
}

personaMenu.addEventListener("click", e => {
  const b = e.target.closest(".dropdown-item");
  if (b) setPersona(+b.dataset.id);
});


/* 8. View & edit spending (modal) --------------------------------------- */

const modalEl = $("entries-modal");
const listView = $("entries-list");
const formView = $("entry-form");
const modalMsg = $("modal-msg");

function modalNote(kind, text) {
  modalMsg.className = `alert alert-${kind}`;
  modalMsg.textContent = text;
}
function clearModalNote() { modalMsg.className = "alert d-none"; }

async function errorText(res) {
  try {
    const { detail } = await res.json();
    if (Array.isArray(detail)) return detail.map(d => d.msg).join("; ");
    if (detail) return detail;
  } catch {}
  return `Server error (${res.status}).`;
}

function showList() {
  formView.classList.add("d-none");
  listView.classList.remove("d-none");
}

function renderEntryList() {
  const ym = $("entries-month").value;
  const rows = state.entries.filter(e => e.month === ym);
  const body = $("entries-body");
  body.replaceChildren();
  $("entries-empty").classList.toggle("d-none", rows.length > 0);
  for (const e of rows) {
    const tr = document.createElement("tr");
    const cell = (text, cls) => { const td = document.createElement("td"); td.textContent = text; if (cls) td.className = cls; return td; };
    tr.append(cell(e.category), cell(e.subcategory), cell(money(e.amount), "text-end"), cell(e.carbonKg.toFixed(2), "text-end"));
    const act = document.createElement("td");
    act.className = "text-end";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-edit";
    btn.dataset.id = e.entryId;
    btn.textContent = "Edit";
    btn.setAttribute("aria-label", `Edit ${e.subcategory}, ${money(e.amount)}`);
    act.appendChild(btn);
    tr.appendChild(act);
    body.appendChild(tr);
  }
}

function fillMonthSelect(preferred) {
  const used = Object.keys(state.byMonth).sort().reverse();
  const sel = $("entries-month");
  sel.replaceChildren(...used.map(ym => {
    const o = document.createElement("option");
    o.value = ym;
    o.textContent = monthName(ym);
    return o;
  }));
  sel.value = used.includes(preferred) ? preferred : used[0] || "";
  renderEntryList();
}

modalEl.addEventListener("show.bs.modal", () => {
  clearModalNote();
  showList();
  fillMonthSelect(state.selected);
});
$("entries-month").addEventListener("change", renderEntryList);

$("entries-body").addEventListener("click", ev => {
  const btn = ev.target.closest(".row-edit");
  if (!btn) return;
  const e = state.entries.find(x => x.entryId === +btn.dataset.id);
  if (!e) return;
  clearModalNote();

  // type dropdown grouped by category, from GET /categories
  const typeSel = $("entry-type");
  typeSel.replaceChildren();
  for (const [cat, subs] of Object.entries(state.categories)) {
    const group = document.createElement("optgroup");
    group.label = cat;
    for (const s of subs) { const o = document.createElement("option"); o.textContent = s; group.appendChild(o); }
    typeSel.appendChild(group);
  }
  typeSel.value = e.subcategory;
  $("entry-id").value = e.entryId;
  $("entry-amount").value = e.amount;
  $("entry-note").value = e.note || "";
  $("entry-context").textContent = `${monthName(e.month)} · ${e.category} · submission ${e.submissionId}`;
  $("entry-carbon").textContent = `Currently ${kg(e.carbonKg)}. Carbon is recalculated when you save.`;
  formView.classList.remove("was-validated");
  listView.classList.add("d-none");
  formView.classList.remove("d-none");
});

$("entry-cancel").addEventListener("click", () => { clearModalNote(); showList(); });

$("entry-delete").addEventListener("click", async ev => {
  ev.preventDefault();
  if (!confirm("Delete this entry? This can't be undone.")) return;
  const delBtn = $("entry-delete");
  delBtn.disabled = true;
  try {
    const res = await fetch(`/entries/${$("entry-id").value}`, { method: "DELETE" });
    if (!res.ok) return modalNote("danger", `Could not delete: ${await errorText(res)}`);
    await loadEntries();
    fillMonthSelect($("entries-month").value);
    showList();
    modalNote("success", "Entry deleted. Your dashboard has been updated.");
  } catch {
    modalNote("danger", "Could not reach the server. Is the API running?");
  } finally {
    delBtn.disabled = false;
  }
});

formView.addEventListener("submit", async ev => {
  ev.preventDefault();
  formView.classList.add("was-validated");
  if (!formView.checkValidity()) return formView.reportValidity();

  const body = new FormData();
  body.append("subcategory", $("entry-type").value);
  body.append("amount", $("entry-amount").value);
  body.append("note", $("entry-note").value);

  const saveBtn = $("entry-save");
  saveBtn.disabled = true;
  try {
    const res = await fetch(`/entries/${$("entry-id").value}`, { method: "PUT", body });
    if (!res.ok) return modalNote("danger", `Could not save: ${await errorText(res)}`);
    await loadEntries();                              // recalculates the chart, totals and insight cards
    fillMonthSelect($("entries-month").value);
    showList();
    modalNote("success", "Changes saved. Your dashboard has been updated.");
  } catch {
    modalNote("danger", "Could not reach the server. Is the API running?");
  } finally {
    saveBtn.disabled = false;
  }
});


/* 9. Start up ------------------------------------------------------------ */

async function init() {
  const params = new URLSearchParams(window.location.search);
  const submission = params.get("submission");

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

  getJSON("/categories").then(c => { state.categories = c; }).catch(() => {});

  // which persona (and month) to show: the submission just made, else ?customer=, else the last one used
  let id = null;
  if (submission !== null) {
    if (!/^\d+$/.test(submission)) return showError("No submission selected.");
    try {
      const res = await fetch(`/submissions/${submission}`);
      if (res.status === 404) return showError("We couldn't find that submission.");
      if (!res.ok) return showError(`Server error (${res.status}).`);
      const data = await res.json();
      id = data.customerId;
      state.selected = data.month;
    } catch {
      return showError("Could not reach the server. Is the API running?");
    }
  }
  if (id === null) {
    let stored = null;
    try { stored = sessionStorage.getItem(STORAGE_KEY); } catch {}
    id = [params.get("customer"), stored].map(Number).find(n => state.personas.some(p => p.customerId === n))
      ?? state.personas[0].customerId;
  }

  setPersona(id, { reload: false });
  await loadEntries();
}

// coming back with the browser's Back button: pick up anything added or edited meanwhile
window.addEventListener("pageshow", e => { if (e.persisted && state.customerId !== null) loadEntries(); });

init();
