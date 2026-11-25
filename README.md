### chudstone-project
NBS capstone project. A carbon footprint and savings advisor: you enter your monthly spending and it shows the carbon impact.

## Tech we're using

- **Backend:** Python 3.14 with FastAPI (we picked Python over C#)
- **Database:** Azure PostgreSQL with SQLAlchemy, with a local SQLite fallback for the pipeline (see [scope decisions](#sprint-1-scope-decisions))
- **Frontend:** HTML, CSS, JavaScript and Bootstrap, served by the API
- **Pipeline:** GitHub Actions: build, unit tests (pytest), SAST (CodeQL), SCA (pip-audit) and DAST (OWASP ZAP)

## Quick start

Run these from the repo root:

```
pip install -r requirements-dev.txt
cp .env.example .env        # then fill in the database username and password
uvicorn api.main:app --app-dir src --reload
```

The shared Azure database is already seeded. Without a `.env` the app uses a local SQLite file instead; run `PYTHONPATH=src python -m api.seed` once to fill it.

`--app-dir src` is needed because the `api` package lives in `src/`. Without it you get `ModuleNotFoundError: No module named 'api'`.

Then go to http://localhost:8000. Full steps, including the database connection, are in the [runbook](infra/README.md).

## Docs

- [Runbook](infra/README.md): how to set up and run everything
- [API contract](docs/api.md): endpoints, requests, responses and status codes
- [DevSecOps](docs/devsecops.md): what the pipeline does and what blocks a merge
- [Backlog](docs/backlog.md)
- [Definition of Ready](docs/DoR.md) / [Definition of Done](docs/DoD.md)
- [Sprint 1 reflection](docs/sprint1-reflection.md)
- [Data dictionary](src/api/data%20dictionary.csv)

## Sprint 1 scope decisions

Where we've deliberately differed from the brief:

| Brief asks for | What we did | Why |
|---|---|---|
| `POST /calculate` | `POST /submit` | `/submit` takes the spending, works out the carbon for each item and saves it, so it does the job `/calculate` was meant to do. See the [API contract](docs/api.md) |
| T-SQL `infra/sql/schema.sql` and `seed.sql` | Azure PostgreSQL, with the tables defined as SQLAlchemy models (`src/api/models.py`) and filled by a seed script (`src/api/seed.py`). Falls back to SQLite when no database is configured | The same Python code builds the tables on any database, so we don't keep separate SQL scripts. The pipeline uses a fresh SQLite database every run, so it needs no secrets and never touches the shared data |
| Separate `EmissionsFactors` table | Emission factors are a column on `categories` | Each subcategory has one factor, so a separate table wasn't needed yet |

---

# Repo Guide

---

## Branching
We will follow the Github flow model of having a protected *main* branch, and separate *feat* branches that going into main (one task is dedicated to one branch)

When you create a new branch **YOU MUST** follow these naming conventions:
- feat/... -> this is for a brand new feature
- fix/... -> this is for a bug fix
- docs/... -> this is for the editing, inclusion or deletion of documentation
- chore/... -> this is for a ongoing housekeeping change or menial thing

---

## Commits
Commits must start with the naming convention "feat: ... etc" commit small changes often 

e.g. If I was creating a new feature in my commits would look like:
*git commit -m "Added login screen button to registration form"*

---

## PR (Pull Requests)

A branch will either be approved or not and depending on that will be accepted into main. (Authors cannot approve their own PRs)

PR Description should have a description of what changed and what you did.

---

### Typical Workflow

1. You get a task
2. You create the new branch for the feature/fix/chore.. etc e.g. **
    - Navigate to main branch *git switch main*
    - Get most recenet version of main *git pull*
    - Create and switch to new feature branch *git switch -c "feature/THE-BRANCH-NAME"*
3. You make your usual code edit and contributions
4. You then push your code to github 
    - Check where you are and the repo status *git status*
    - Add the newly edited files to be ready for pushing *git add .*
    - Commit the files *git commit -m "feat: added new feature... meow"*
    - push the committed files to your branch *git push -u origin feature/YOUR-BRANCH-NAME
5. Code and updated branch seen on the repo
6. Pending Approval or disproval
7. Code then merged into main