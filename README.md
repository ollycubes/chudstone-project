### chudstone-project
NBS capstone project. A carbon footprint and savings advisor: you enter your monthly spending and it shows the carbon impact.

## Tech we're using

- **Backend:** Python 3.14 with FastAPI (we picked Python over C#)
- **Database:** SQLite with SQLAlchemy (T-SQL files still to do)
- **Frontend:** HTML, CSS, JavaScript and Bootstrap, served by the API
- **Pipeline:** GitHub Actions with CodeQL for security scanning

## Quick start

Run these from the repo root:

```
pip install -r requirements-dev.txt
PYTHONPATH=src python -m api.seed
uvicorn api.main:app --app-dir src --reload
```

`--app-dir src` is needed because the `api` package lives in `src/`. Without it you get `ModuleNotFoundError: No module named 'api'`.

Then go to http://localhost:8000. Full steps are in the [runbook](infra/README.md).

## Docs

- [Runbook](infra/README.md): how to set up and run everything
- [API contract](docs/api.md): endpoints, requests, responses and status codes
- [DevSecOps](docs/devsecops.md): what the pipeline does and what blocks a merge
- [Backlog](docs/backlog.md)
- [Definition of Ready](docs/DoR.md) / [Definition of Done](docs/DoD.md)
- [Sprint 1 reflection](docs/sprint1-reflection.md)
- [Data dictionary](src/api/data%20dictionary.csv)

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