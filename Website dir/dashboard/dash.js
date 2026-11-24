const msg = document.getElementById("msg");

function showError(text) {
  msg.textContent = text;
  msg.classList.remove("d-none");
}

const money = n => "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthName(ym) {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// fills a table body with rows of [text, className] cells (textContent, so db values can't inject html)
function fillTable(tbody, rows) {
  rows.forEach(cells => {
    const tr = document.createElement("tr");
    cells.forEach(([text, cls]) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

const kg = n => Number(n).toFixed(1) + " kg CO₂e";

// the headline cards and the by-category table both cover the whole month for this persona,
// across every submission they made for it (GET /totals)
async function loadMonth(customerId, month) {
  const note = document.getElementById("totals-msg");
  const fail = text => {
    note.textContent = text;
    note.classList.remove("d-none");
    document.getElementById("total-spend").textContent = "–";
    document.getElementById("total-carbon").textContent = "–";
  };
  let rows;
  try {
    const res = await fetch(`/totals?${new URLSearchParams({ customer_id: customerId, month })}`);
    if (!res.ok) return fail(`Couldn't load this month's totals (${res.status}).`);
    rows = await res.json();
  } catch {
    return fail("Couldn't load this month's totals.");
  }
  document.getElementById("total-spend").textContent = money(rows.reduce((t, r) => t + r.spend, 0));
  document.getElementById("total-carbon").textContent = kg(rows.reduce((t, r) => t + r.carbon, 0));
  fillTable(document.getElementById("totals"),
    rows.map(r => [[r.category], [money(r.spend), "text-end"], [Number(r.carbon).toFixed(2), "text-end"]]));
}

async function loadDashboard() {
  const id = new URLSearchParams(window.location.search).get("submission");
  if (!/^\d+$/.test(id || "")) return showError("No submission selected.");

  let data;
  try {
    const res = await fetch(`/submissions/${id}`);
    if (res.status === 404) return showError("We couldn't find that submission.");
    if (!res.ok) return showError(`Server error (${res.status}).`);
    data = await res.json();
  } catch {
    return showError("Could not reach the server. Is the API running?");
  }

  document.getElementById("month-label").textContent = " for " + monthName(data.month);
  document.getElementById("totals-month").textContent = monthName(data.month);
  if (data.persona) document.getElementById("persona").textContent = "Example: " + data.persona;

  // "Just added" is only this submission
  document.getElementById("sub-totals").textContent = `${money(data.totalSpend)} · ${kg(data.totalCarbonKg)}`;
  fillTable(document.getElementById("entries"), data.entries.map(e =>
    [[e.category], [e.subcategory], [money(e.amount), "text-end"], [Number(e.carbonKg).toFixed(2), "text-end"]]));

  loadMonth(data.customerId, data.month);
}

loadDashboard();
