/* =============================================================================
   MONTHLY SPENDING FORM
   What this page does:
   1. The user picks a month (a custom month/year picker).
   2. They add expenses grouped by category (Travel, Food, Utilities).
      - Each category can appear only ONCE on the page.
      - Each category can hold many expense rows (type, amount, optional note).
   3. On submit, blank rows are ignored, the rest are validated, and a summary
      message (total + count) is shown.
   -----------------------------------------------------------------------------
      CONTENTS
   1. Config / Data
   2. DOM References
   3. Month Picker
   4. Templates (HTML)
   5. Category Sections
   6. Event Handlers
   7. Form Submission
   8. Initial State

   Requires: Bootstrap 5 (dropdown + form styles)
   ============================================================================= */


/* 1. CONFIG / DATA */

// Categories and the expense types available within each
const TYPES = {
  Travel:    ["Trains", "Bus", "Self-owned car", "Car share", "Taxi", "Plane", "Other"],
  Food:      ["Grocery", "Food delivery", "Restaurant", "Other"],
  Utilities: ["Electricity", "Gas", "Water", "Other"]
};
const CATS   = Object.keys(TYPES);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Small reusable SVG icons (Bootstrap Icons)
const ICON_DELETE = `
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
  </svg>`;

const ICON_ADD = `
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>
  </svg>`;


/* 2. DOM REFERENCES */

// Form + category sections
const form     = document.getElementById("form");
const sections = document.getElementById("sections");
const nextBtn  = document.getElementById("next");
const msg      = document.getElementById("msg");

// Month picker
const monthInput = document.getElementById("month");
const monthBtn   = document.getElementById("month-btn");
const mpYear     = document.getElementById("mp-year");
const mpGrid     = document.getElementById("mp-grid");


/* 3. MONTH PICKER */

const now  = new Date();
const maxY = now.getFullYear();
const maxM = now.getMonth();     // latest selectable month (no future months)
let viewYear = maxY;             // year currently displayed in the picker

// Store the chosen month ("YYYY-MM") and show it on the dropdown button. 
function setMonth(y, m) {
  monthInput.value = `${y}-${String(m + 1).padStart(2, "0")}`;
  monthBtn.textContent = new Date(y, m).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Draw the 12-month grid for `viewYear`, marking the selected and disabled (future) months.
function renderMonths() {
  mpYear.textContent = viewYear;
  document.getElementById("mp-next").disabled = viewYear >= maxY;

  const [selY, selM] = monthInput.value.split("-").map(Number);

  mpGrid.innerHTML = MONTHS.map((name, i) => {
    const isFuture   = viewYear === maxY && i > maxM;
    const isSelected = viewYear === selY && i === selM - 1;
    return `<button type="button" class="mp-m${isSelected ? " sel" : ""}" data-m="${i}"${isFuture ? " disabled" : ""}>${name}</button>`;
  }).join("");
}

// Previous / next year arrows
document.getElementById("mp-prev").onclick = () => { viewYear--; renderMonths(); };
document.getElementById("mp-next").onclick = () => { viewYear++; renderMonths(); };

// Clicking a month: select it, close the dropdown, redraw
mpGrid.addEventListener("click", e => {
  const btn = e.target.closest(".mp-m");
  if (!btn) return;
  setMonth(viewYear, +btn.dataset.m);
  bootstrap.Dropdown.getOrCreateInstance(monthBtn).hide();
  renderMonths();
});


/* 4. TEMPLATES (HTML) */

// One expense row: type dropdown, amount (£), optional note, and a delete button.
const rowHTML = (cat) => `
  <div class="exp">
    <input type="hidden" name="category" value="${cat}">
    <div class="row gx-3 gy-2">

      <!-- Expense type -->
      <div class="col-12 col-md-6">
        <label class="form-label">${cat} type <span class="req">*</span></label>
        <select name="expense_type" class="form-select" required>
          <option value="" selected disabled>Select one...</option>
          ${TYPES[cat].map(t => `<option>${t}</option>`).join("")}
        </select>
      </div>

      <!-- Amount + delete-row button -->
      <div class="col-12 col-md-6">
        <div class="d-flex justify-content-between align-items-center">
          <label class="form-label">Amount spent <span class="req">*</span></label>
          <button type="button" class="del" aria-label="Delete this expense">${ICON_DELETE}</button>
        </div>
        <div class="input-group">
          <span class="input-group-text">£</span>
          <input type="number" name="amount" class="form-control" placeholder="0.00" step="0.01" min="0" required>
        </div>
      </div>

      <!-- Optional note -->
      <div class="col-12">
        <label class="form-label">Note (optional)</label>
        <input type="text" name="note" class="form-control" placeholder="Add note" maxlength="200">
      </div>

    </div>
  </div>`;

// The category section shell: category buttons, expense rows area, "add another" button.
const sectionHTML = () => `
  <div class="d-flex justify-content-between align-items-center">
    <span class="form-label">Pick a category <span class="req">*</span></span>
    <button type="button" class="rm-cat">Remove category</button>
  </div>
  <div class="cats">
    ${CATS.map(c => `<button type="button" class="cat" data-cat="${c}">${c}</button>`).join("")}
  </div>
  <div class="rows"></div>
  <button type="button" class="add mt-2"></button>`;


/* 5. CATEGORY SECTIONS */

// Categories already on the page.
const usedCats = () => [...sections.querySelectorAll(".section")].map(s => s.dataset.cat);

// Does every input/select in this container have no value? (used to detect empty rows/sections)
const isBlank = (el) => [...el.querySelectorAll("select,input:not([type=hidden])")].every(x => !x.value);

// Append a new category section and start it on `cat`.
function addSection(cat) {
  const s = document.createElement("div");
  s.className = "section";
  s.innerHTML = sectionHTML();
  sections.appendChild(s);
  setCategory(s, cat);
}

// Switch a section to a category: resets its rows to one empty row and updates the "add" label.
function setCategory(s, cat) {
  s.dataset.cat = cat;
  s.querySelector(".rows").innerHTML = rowHTML(cat);
  s.querySelector(".add").innerHTML = `Add another ${cat.toLowerCase()} expense ${ICON_ADD}`;
  refresh();
}

/*
   Sync the UI with the current state:
   - highlight each section's active category button
   - disable categories already used by another section (each only once)
   - hide the "add category" button when all categories are in use
   - show "Remove category" only when more than one section exists
 */
function refresh() {
  const used = usedCats();

  sections.querySelectorAll(".section").forEach(s => {
    s.querySelectorAll(".cat").forEach(b => {
      const active = b.dataset.cat === s.dataset.cat;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
      b.disabled = !active && used.includes(b.dataset.cat);
    });
  });

  nextBtn.classList.toggle("invisible", used.length >= CATS.length);
  sections.querySelectorAll(".rm-cat").forEach(b => b.classList.toggle("d-none", used.length < 2));
}


/* 6. EVENT HANDLERS */

// All clicks inside the sections area (event delegation)
sections.addEventListener("click", e => {
  const s = e.target.closest(".section");
  if (!s) return;

  // Remove whole category (confirm first if the user has typed anything)
  if (e.target.closest(".rm-cat")) {
    if (isBlank(s) || confirm(`Remove the ${s.dataset.cat} category and its expenses?`)) {
      s.remove();
      refresh();
    }
    return;
  }

  // Change category
  const cat = e.target.closest(".cat");
  if (cat && cat.dataset.cat !== s.dataset.cat) setCategory(s, cat.dataset.cat);

  // Add another expense row
  if (e.target.closest(".add")) {
    s.querySelector(".rows").insertAdjacentHTML("beforeend", rowHTML(s.dataset.cat));
  }

  // Delete an expense row (always keep at least one row in the section)
  const del = e.target.closest(".del");
  if (del) {
    del.closest(".exp").remove();
    if (!s.querySelector(".exp")) s.querySelector(".rows").innerHTML = rowHTML(s.dataset.cat);
  }
});

// "Add another category" button: adds the first unused category and scrolls to it
nextBtn.addEventListener("click", () => {
  const free = CATS.find(c => !usedCats().includes(c));
  if (free) {
    addSection(free);
    sections.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});


/* 7. FORM SUBMISSION */

form.addEventListener("submit", e => {
  e.preventDefault();   // DEMO ONLY: replace with a real POST to /spending/add

  const rows    = [...form.querySelectorAll(".exp")];
  const skipped = rows.filter(isBlank);   // completely empty rows are ignored

  // Temporarily disable blank rows so they don't trigger "required" validation
  const setDisabled = (state) =>
    skipped.forEach(r => r.querySelectorAll("select,input").forEach(x => x.disabled = state));

  setDisabled(true);
  form.classList.add("was-validated");
  const firstInvalid = form.querySelector(":invalid");
  setDisabled(false);

  msg.className = "alert";

  // Case 1: nothing filled in at all
  if (skipped.length === rows.length) {
    msg.classList.add("alert-danger");
    msg.textContent = "Add at least one expense before confirming.";
    return;
  }

  // Case 2: a partially filled row is invalid -> show the browser's validation bubble
  if (firstInvalid) {
    msg.classList.add("d-none");
    firstInvalid.reportValidity();
    return;
  }

  // Case 3: success -> total up the amounts and show a summary
  const total = rows
    .filter(r => !isBlank(r))
    .reduce((sum, r) => sum + (parseFloat(r.querySelector("[name=amount]").value) || 0), 0);

  const [y, m] = form.month.value.split("-");
  const monthName = new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  msg.textContent = `Spending confirmed for ${monthName}: £${total.toFixed(2)} across ${rows.length - skipped.length} expense(s).`;
  msg.classList.add("alert-success");
  window.scrollTo({ top: 0, behavior: "smooth" });
});


/* 8. INITIAL STATE */

setMonth(maxY, maxM);    // default to the current month
renderMonths();
addSection("Travel");    // start with one Travel section on the page