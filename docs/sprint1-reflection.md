# Sprint 1 Reflection

## What we built

- A FastAPI backend in Python 3.14 that saves monthly spending and works out the carbon for each item
- A SQLite database seeded with Travel, Food and Utilities categories, emission factors and personas
- A spending form that loads its categories and personas from the database
- A dashboard that shows the results of a submission
- A GitHub Actions pipeline with build, unit tests (pytest), SAST (CodeQL), SCA (pip-audit) and DAST (OWASP ZAP against the running API)
- API unit tests that run in the pipeline on every push
- Branch rules, PR/issue templates, DoR and DoD

## What went well

- Everyone got set up with Git early. We all did a test branch and PR on day 1
- Small PRs with reviews meant we mostly didn't break each other's work
- The form and backend got connected end to end, so we can actually demo a submission going in and showing on the dashboard

## What didn't go so well

- A PR (#24) accidentally removed the form's POST to the backend and we had to revert it (#25)
- Categories were hardcoded in two places (frontend and backend) and got out of sync with the database, so some options failed when submitted. Fixed by loading them from the database
- We focused on the app first and left the DevSecOps parts (unit tests, SCA and DAST) until late in the sprint. They're in now, but it was a rush

## What we'll do differently

- Do the pipeline and tests earlier instead of leaving them till the end
- Read the brief's acceptance criteria at the start of the sprint and make an issue for each one
- Pull `main` before starting new work to avoid conflicts

## Carry over to Sprint 2

- `Assumptions` table
- Bandit in the pipeline
- Update Playwright tests for the new form

## Sign-off

| Role | Name | Date |
|---|---|---|
| Product Owner | | |
| Scrum Master | | |
