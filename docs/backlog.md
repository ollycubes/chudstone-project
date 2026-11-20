# Product Backlog

Legend:
done X
In progress O 
To do ?

## Sprint 1

### Setup

| Item | Owner | Status |
|---|---|---|
| Create GitHub repo, branching rules and README | Oliver | X |
| PR and issue templates | Oliver | X |
| Everyone tests making a branch, commit and PR | Everyone | X |
| Definition of Ready / Definition of Done | | X |

### Backend / API

| Item | Owner | Status |
|---|---|---|
| FastAPI skeleton (Python 3.14) | Oliver | X |
| Fix CORS and requirements | Oliver | X |
| `POST /submit` saves spending and works out carbon | Oliver | X |
| `GET /submissions/{id}` for the dashboard | Tanha | X |
| `GET /categories` and `GET /personas` from the database | Oliver | X |
| `POST /calculate` endpoint (from the brief) | | ? |
| `/totals` should use the selected persona, not always customer 1 | | ? |
| API contract documented (`docs/api.md`) | | X |

### Database

| Item | Owner | Status |
|---|---|---|
| SQLite database with SQLAlchemy models | DamoDB | X |
| Seed Travel, Food and Utilities data | DamoDB | X |
| Add emission factors to the categories table | DamoDB | X |
| Personas seeded into `customers` | numgum | X |
| `infra/sql/schema.sql` and `seed.sql` in T-SQL | | ? |
| `EmissionsFactors` table with source, version and effective date | | ? |
| `Assumptions` table | | ? |

### Frontend

| Item | Owner | Status |
|---|---|---|
| Spending form (HTML) | DamoDB | X |
| Split form into HTML, CSS and JS | Anjleen | X |
| Form styling | Anjleen | X |
| Clean up and comment the form, one category per section | Tanha | X |
| Connect the form to the backend | Oliver | X |
| Dashboard MVP | Tanha | X |
| Persona dropdown in the header | Oliver | X |

### Testing and DevSecOps

| Item | Owner | Status |
|---|---|---|
| Pipeline with build step (`devsecops.yml`) | Oliver | X |
| SAST with CodeQL | Doml04 | X |
| Playwright frontend tests | numgum | O (need updating for the new form) |
| Unit tests for the API with pytest, run in the pipeline | | ? |
| SCA with `pip-audit` in the pipeline | | ? |
| Bandit in the pipeline | | ? |
| DAST against the running API (e.g. OWASP ZAP) | | ? |
| Deliberate security finding + fix as evidence | | ? |

### Docs

| Item | Owner | Status |
|---|---|---|
| Runbook (`infra/README.md`) | | X |
| DevSecOps doc (`docs/devsecops.md`) | | X |
| Sprint 1 reflection | Everyone | O |

## Later sprints

- Full carbon calculation engine (Sprint 2)
- Recommendations for saving carbon
- Login so we don't need the persona dropdown
- Azure Key Vault for secrets
- Terraform (stretch)
