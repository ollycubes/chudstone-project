# API Contract

Our API is built with **FastAPI** in **Python 3.14**. The code is in `src/api/main.py`.

When the API is running you can also see all of this at http://localhost:8000/docs (FastAPI makes this page for us automatically).

All examples assume the API is running on `http://localhost:8000`.

---

## POST /submit

Saves one month of spending for a persona and works out the carbon for each item.

> Note: the sprint brief asks for `POST /calculate`. We haven't added that yet, `/submit` is the endpoint that does the calculating right now. See the backlog.

### Request

Sent as **form data** (not JSON) because it comes straight from the HTML form.

| Field | Type | Required | Rules |
|---|---|---|---|
| `month` | string | yes | Format `YYYY-MM`, e.g. `2026-10` |
| `customer_id` | int | no (defaults to 1) | Must be 1 or more, and must exist in the `customers` table |
| `subcategory_id` | string (list) | yes | 1 to 50 items. Each one must exist in the `categories` table, e.g. `Bus` |
| `amount` | number (list) | yes | 1 to 50 items. More than 0, max 1,000,000,000, max 2 decimal places |
| `note` | string (list) | no | Max 200 characters each. Can be left out completely, but if it's sent there must be one per expense (blank is fine) |

`subcategory_id`, `amount` and `note` are sent once per expense, so the 1st amount and note go with the 1st subcategory and so on. Blank notes are saved as `NULL`.

Example with curl:

```
curl -X POST http://localhost:8000/submit \
  -F month=2026-10 -F customer_id=2 \
  -F subcategory_id=Bus -F amount=10 -F note="commute to work" \
  -F subcategory_id=Groceries -F amount=20 -F note=""
```

### Response

**201 Created**

```json
{
  "status": "saved",
  "submissionId": 3,
  "entries": 2
}
```

### Status codes

| Code | When |
|---|---|
| 201 | Saved ok |
| 422 | Something in the request is wrong, e.g. bad month format, negative amount, unknown subcategory, unknown persona, or the number of amounts doesn't match the number of subcategories. The `detail` field says what was wrong. |

Example 422:

```json
{ "detail": "Entry 1: unknown type Plane." }
```

---

## GET /submissions/{submission_id}

Gets one saved submission back with the carbon worked out. The dashboard uses this.

**200 OK**

```json
{
  "submissionId": 3,
  "month": "2026-10",
  "totalSpend": 30.0,
  "totalCarbonKg": 11.05,
  "entries": [
    { "category": "Travel", "subcategory": "Bus", "amount": 10.0, "carbonKg": 1.05, "note": "commute to work" },
    { "category": "Food", "subcategory": "Groceries", "amount": 20.0, "carbonKg": 10.0, "note": null }
  ]
}
```

**404** if the submission doesn't exist: `{ "detail": "Submission not found." }`

---

## GET /categories

Returns every category and its subcategories from the database. The form uses this to build its buttons and dropdowns.

**200 OK**

```json
{
  "Food": ["Delivery", "Groceries", "Restaurant/Dine out"],
  "Travel": ["Airplane", "Bus", "Carshare", "Motorbike", "Self-owned car", "Subway", "Taxi", "Train"],
  "Utilities": ["Electricity", "Heating", "Water"]
}
```

---

## GET /personas

Returns all the personas (customers) from the database. The form uses this for the persona dropdown in the header.

**200 OK**

```json
[
  { "customerId": 1, "persona": "Default" },
  { "customerId": 2, "persona": "Single Professional" }
]
```

---

## GET /totals

Spend and carbon added up per category. Optional `?month=YYYY-MM` to filter by month.

> Known issue: this is always for customer 1 at the moment.

**200 OK**

```json
[
  { "category": "Travel", "spend": 363.4, "carbon": 58.4 }
]
```

---

## How carbon is worked out

```
carbon (kg) = amount (£) x emission factor
```

The emission factor for each subcategory is stored in the `categories` table.
