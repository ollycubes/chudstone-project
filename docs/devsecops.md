# DevSecOps

Our pipeline is in `.github/workflows/devsecops.yml` and runs on GitHub Actions.

## When it runs

- Every push to any branch
- Every PR into `main`
- Manually from the Actions tab (`workflow_dispatch`)

## What it does right now

### 1. Build [X]

- Installs Python 3.14 and everything in `requirements-dev.txt`
- Checks the app actually imports (`python -c "import api.main"`), so if there's a syntax error or a missing package the build fails

### 2. Unit tests: pytest [X]

- **Tool:** `pytest` with FastAPI's `TestClient`
- **What it tests:** the API tests in `tests/api/`. Each test gets a fresh in-memory database seeded with the same data as `seed.py`, so nothing touches a real database
- **When:** every push, after the build passes. SCA and DAST only run if the tests pass
- **Results:** the pass/fail count is in the run summary, and the full results (`pytest.xml` and `pytest.txt`) are in the `unit-test-results` artifact
- **Blocking:** any failing test fails the pipeline
- **Known bugs:** tests marked `xfail` are for bugs we know about but haven't fixed yet. They show as `xfailed` and don't block. Once the bug is fixed the test starts passing, which fails the pipeline (`strict=True`) to remind us to remove the `xfail` mark

### 3. SAST: CodeQL [X]

- **Tool:** GitHub CodeQL, using the `security-extended` set of checks
- **What it scans:** all our Python code. The `tests` folder is skipped
- **When:** every push to any branch, and every PR into `main`
- **Findings:** show up in the repo under **Security > Code scanning**. Each one has a severity of Critical, High, Medium, Low or Note
- **Blocking:** CodeQL failing to run fails the pipeline. We should also set the branch protection on `main` so that High or Critical findings block the PR from merging

### 4. SCA: pip-audit [X]

- **Tool:** `pip-audit`, which checks our packages against the PyPI and OSV vulnerability databases
- **What it scans:** every package pinned in `requirements.txt` (and the packages they depend on)
- **When:** every push, after the unit tests pass
- **Findings:** a table in the run summary (and the `sca-report` artifact) with:
  - Name (the dependency)
  - Version
  - ID (the vulnerability, e.g. `PYSEC-2021-66`). Click it to see the severity on osv.dev
  - Fix Versions (what to upgrade to, this is the remediation)
  - Description
- **Blocking:** any known vulnerability fails the job

Example of what a finding looks like (from testing with an old `jinja2==2.10`):

```
Name   | Version | ID             | Fix Versions | Description
jinja2 | 2.10    | PYSEC-2019-217 | 2.10.1       | In Pallets Jinja before 2.10.1, str.format_map allows a sandbox escape.
```

To fix it you'd bump the version in `requirements.txt` to the fix version.

### 5. DAST: OWASP ZAP [X]

- **Tool:** OWASP ZAP API scan (`zaproxy/action-api-scan`)
- **How it works:** the job seeds a fresh database, starts the real API with uvicorn, then ZAP reads our OpenAPI spec (`/openapi.json`) and attacks every endpoint in it
- **What it tests:** invalid input, unexpected parameters, malformed requests, error handling, exposed technical errors (e.g. stack traces) and common attacks like SQL injection and XSS
- **When:** every push to any branch, and every PR into `main` (takes a few minutes)
- **Findings:** ZAP gives each alert a risk level of High, Medium, Low or Informational. The full report (HTML, Markdown and JSON) is in the `dast-report` artifact, and the API's own log is in `dast-api-log`
- **Blocking:** only the High risk attacks listed in `.zap/rules.tsv` fail the job (SQL injection, XSS, command injection, path traversal etc.). Everything else is reported but doesn't block. To make another rule block, add its ID to that file with `FAIL`

## Still to do

| Step | Plan |
|---|---|
| Extra SAST | Add `bandit -r src`. Already in `requirements-dev.txt` |
| DAST on `/calculate` | Once `POST /calculate` exists it gets scanned automatically, since ZAP scans everything in the OpenAPI spec |
| Evidence | Plant a known issue, screenshot the finding, fix it, screenshot the clean run. Save these in `docs/evidence/`. Easy one for SCA: pin `jinja2==2.10` in `requirements.txt` on a branch |

## What should block a merge

| Check | Blocks? |
|---|---|
| Build fails | Yes |
| Unit tests fail | Yes |
| CodeQL / Bandit High or Critical | Yes |
| CodeQL / Bandit Medium or Low | No, but make an issue for it |
| pip-audit finds a vulnerability | Yes. If there's no fix available yet, make an issue for it |
| ZAP High (rules in `.zap/rules.tsv`) | Yes |
| ZAP Medium / Low / Informational | No, but make an issue for it |

## Security basics we follow

- No secrets in GitHub. `.env` and `*.db` are in `.gitignore`
- Only made-up (synthetic) data, no real customers
- All dependencies are pinned to exact versions in `requirements.txt`
- Every change goes through a PR and needs someone else to approve it
