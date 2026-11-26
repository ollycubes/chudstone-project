// filled from the backend (GET /categories) so the options always match what /submit accepts
let TYPES = {};
let CATS = [];
const sections = document.getElementById("sections");
const nextBtn = document.getElementById("next");
const msg = document.getElementById("msg");

const monthInput = document.getElementById("month");
const monthBtn = document.getElementById("month-btn");
const mpYear = document.getElementById("mp-year");
const mpGrid = document.getElementById("mp-grid");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const now = new Date();
const maxY = now.getFullYear(), maxM = now.getMonth();   // no future months
let viewYear = maxY;

function setMonth(y, m) {
  monthInput.value = `${y}-${String(m + 1).padStart(2, "0")}`;
  monthBtn.textContent = new Date(y, m).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function renderMonths() {
  mpYear.textContent = viewYear;
  document.getElementById("mp-next").disabled = viewYear >= maxY;
  const [selY, selM] = monthInput.value.split("-").map(Number);
  mpGrid.innerHTML = MONTHS.map((n, i) => {
    const future = viewYear === maxY && i > maxM;
    const sel = viewYear === selY && i === selM - 1;
    return `<button type="button" class="mp-m${sel ? " sel" : ""}" data-m="${i}"${future ? " disabled" : ""}>${n}</button>`;
  }).join("");
}

document.getElementById("mp-prev").onclick = () => { viewYear--; renderMonths(); };
document.getElementById("mp-next").onclick = () => { viewYear++; renderMonths(); };
mpGrid.addEventListener("click", e => {
  const b = e.target.closest(".mp-m");
  if (!b) return;
  setMonth(viewYear, +b.dataset.m);
  bootstrap.Dropdown.getOrCreateInstance(monthBtn).hide();
  renderMonths();
});

setMonth(maxY, maxM);   // default to the current month
renderMonths();


const rowHTML = (cat) => `
  <div class="exp">
    <input type="hidden" name="category" value="${cat}">
    <div class="row gx-3 gy-2">
      <div class="col-12 col-md-6">
        <label class="form-label">${cat} type <span class="req">*</span></label>
        <select name="expense_type" class="form-select" required>
          <option value="" selected disabled>Select one...</option>
          ${TYPES[cat].map(t => `<option>${t}</option>`).join("")}
        </select>
      </div>
      <div class="col-12 col-md-6">
        <div class="d-flex justify-content-between align-items-center">
          <label class="form-label">Amount spent <span class="req">*</span></label>
          <button type="button" class="del" aria-label="Delete this expense">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
          </button>
        </div>
        <div class="input-group">
          <span class="input-group-text">£</span>
          <input type="number" name="amount" class="form-control" placeholder="0.00" step="0.01" min="0.01" required>
        </div>
      </div>
      <div class="col-12">
        <label class="form-label">Note (optional)</label>
        <input type="text" name="note" class="form-control" placeholder="Add note" maxlength="200">
      </div>
    </div>
  </div>`;

const usedCats = () => [...sections.querySelectorAll(".section")].map(s => s.dataset.cat);

function addSection(cat) {
  const s = document.createElement("div");
  s.className = "section";
  s.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <span class="form-label">Pick a category <span class="req">*</span></span>
      <button type="button" class="rm-cat">Remove category</button>
    </div>
    <div class="cats">${CATS.map(c => `<button type="button" class="cat" data-cat="${c}">${c}</button>`).join("")}</div>
    <div class="rows"></div>
    <button type="button" class="add mt-2"></button>`;
  sections.appendChild(s);
  setCategory(s, cat);
}

function setCategory(s, cat) {
  s.dataset.cat = cat;
  s.querySelector(".rows").innerHTML = rowHTML(cat);
  s.querySelector(".add").innerHTML = `Add another ${cat.toLowerCase()} expense
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>`;
  refresh();
}

function refresh() {
  const used = usedCats();
  sections.querySelectorAll(".section").forEach(s => {
    s.querySelectorAll(".cat").forEach(b => {
      const on = b.dataset.cat === s.dataset.cat;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on);
      b.disabled = !on && used.includes(b.dataset.cat);   // a category can only be used once
    });
  });
  nextBtn.classList.toggle("invisible", used.length >= CATS.length);
  // Only offer removal when there is more than one category on the page
  sections.querySelectorAll(".rm-cat").forEach(b => b.classList.toggle("d-none", used.length < 2));
}

sections.addEventListener("click", e => {
  const s = e.target.closest(".section");
  if (!s) return;
  if (e.target.closest(".rm-cat")) {
    const filled = [...s.querySelectorAll("select,input:not([type=hidden])")].some(x => x.value);
    if (!filled || confirm(`Remove the ${s.dataset.cat} category and its expenses?`)) { s.remove(); refresh(); }
    return;
  }
  const cat = e.target.closest(".cat");
  if (cat && cat.dataset.cat !== s.dataset.cat) setCategory(s, cat.dataset.cat);
  if (e.target.closest(".add")) s.querySelector(".rows").insertAdjacentHTML("beforeend", rowHTML(s.dataset.cat));
  const del = e.target.closest(".del");
  if (del) {
    del.closest(".exp").remove();
    if (!s.querySelector(".exp")) s.querySelector(".rows").innerHTML = rowHTML(s.dataset.cat);
  }
});

nextBtn.addEventListener("click", () => {
  const free = CATS.find(c => !usedCats().includes(c));
  if (free) { addSection(free); sections.lastElementChild.scrollIntoView({behavior:"smooth", block:"center"}); }
});

function showMsg(kind, text) {
  msg.className = `alert alert-${kind}`;
  msg.textContent = text;
  window.scrollTo({top:0, behavior:"smooth"});
}

async function errorText(res) {
  try {
    const { detail } = await res.json();
    if (Array.isArray(detail)) return detail.map(d => d.msg).join("; ");
    if (detail) return detail;
  } catch {}
  return `Server error (${res.status}).`;
}

document.getElementById("form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target, rows = [...form.querySelectorAll(".exp")];
  const blank = r => [...r.querySelectorAll("select,input:not([type=hidden])")].every(x => !x.value);
  const skipped = rows.filter(blank);
  skipped.forEach(r => r.querySelectorAll("select,input").forEach(x => x.disabled = true));
  form.classList.add("was-validated");
  const bad = form.querySelector(":invalid");
  skipped.forEach(r => r.querySelectorAll("select,input").forEach(x => x.disabled = false));
  msg.className = "alert";
  if (skipped.length === rows.length) { msg.classList.add("alert-danger"); msg.textContent = "Add at least one expense before confirming."; return; }
  if (bad) { msg.classList.add("d-none"); bad.reportValidity(); return; }
  const filled = rows.filter(r => !blank(r));
  const total = filled.reduce((t, r) => t + (parseFloat(r.querySelector("[name=amount]").value) || 0), 0);
  const [y, m] = form.month.value.split("-");
  const monthName = new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const body = new FormData();
  body.append("month", form.month.value);
  // no customer_id: the server saves it for whoever is signed in (the session cookie)
  if (customerId === null) return showMsg("danger", "Personas haven't loaded, so this can't be saved yet.");
  filled.forEach(r => {
    body.append("subcategory_id", r.querySelector("[name=expense_type]").value);
    body.append("amount", r.querySelector("[name=amount]").value);
    body.append("note", r.querySelector("[name=note]").value);   // sent even when blank so notes stay lined up with their expense
  });

  const submitBtn = form.querySelector("[type=submit]");
  submitBtn.disabled = true;
  try {
    const res = await fetch(form.action, { method: "POST", body });
    if (!res.ok) return showMsg("danger", `Could not save: ${await errorText(res)}`);
    const data = await res.json();
    window.location.href = `/dashboard/dash.html?submission=${data.submissionId}`;
  } catch {
    showMsg("danger", "Could not reach the server. Is the API running?");
  } finally {
    submitBtn.disabled = false;
  }
});

// persona picker in the header pill, filled from the backend (GET /personas)
const personaBtn = document.getElementById("persona-btn");
const personaMenu = document.getElementById("persona-menu");
let customerId = null;

function setPersona(id, name) {
  customerId = id;
  personaBtn.textContent = `Example: ${name}`;
  document.getElementById("persona-footer").textContent = name;
  personaMenu.querySelectorAll(".dropdown-item").forEach(b => {
    const on = +b.dataset.id === id;
    b.classList.toggle("active", on);
    b.setAttribute("aria-current", on);
  });
}

// switching persona starts a new server session for it, so the spending is saved for that persona
async function startSession(id) {
  const body = new FormData();
  body.append("customer_id", id);
  const res = await fetch("/session", { method: "POST", body });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

personaMenu.addEventListener("click", e => {
  const b = e.target.closest(".dropdown-item");
  if (!b) return;
  startSession(+b.dataset.id)
    .then(p => setPersona(p.customerId, p.persona))
    .catch(() => showMsg("danger", "Couldn't switch persona. Is the API running?"));
});

fetch("/personas")
  .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  .then(async list => {
    if (!list.length) throw new Error("no personas");
    personaMenu.innerHTML = list.map(p =>
      `<li><button type="button" class="dropdown-item" data-id="${p.customerId}">${p.persona}</button></li>`).join("");
    // carry on as whoever is already signed in (e.g. picked on the dashboard), else the first persona
    const res = await fetch("/session");
    if (res.status !== 401 && !res.ok) throw new Error(res.status);
    const p = res.ok ? await res.json() : await startSession(list[0].customerId);
    setPersona(p.customerId, p.persona);
  })
  .catch(() => {
    personaBtn.textContent = "Example: unavailable";
    showMsg("danger", "Could not load personas from the server.");
  });

fetch("/categories")
  .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  .then(data => {
    TYPES = data; CATS = Object.keys(TYPES);
    if (!CATS.length) throw new Error("no categories");
    addSection(CATS[0]);
  })
  .catch(() => showMsg("danger", "Could not load spending categories from the server."));