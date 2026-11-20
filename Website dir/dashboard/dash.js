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
  document.getElementById("total-spend").textContent = money(data.totalSpend);
  document.getElementById("total-carbon").textContent = Number(data.totalCarbonKg).toFixed(1) + " kg CO₂e";

  const tbody = document.getElementById("entries");
  data.entries.forEach(e => {
    const tr = document.createElement("tr");
    [[e.category], [e.subcategory], [money(e.amount), "text-end"], [Number(e.carbonKg).toFixed(2), "text-end"]]
      .forEach(([text, cls]) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (cls) td.className = cls;
        tr.appendChild(td);
      });
    tbody.appendChild(tr);
  });
}

loadDashboard();