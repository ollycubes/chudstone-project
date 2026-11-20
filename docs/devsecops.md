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

### 2. SAST: CodeQL [X]

- **Tool:** GitHub CodeQL, using the `security-extended` set of checks
- **What it scans:** all our Python code. The `tests` folder is skipped
- **When:** on PRs and on pushes to `main` (not on every feature branch push, to save time)
- **Findings:** show up in the repo under **Security > Code scanning**. Each one has a severity of Critical, High, Medium, Low or Note
- **Blocking:** CodeQL failing to run fails the pipeline. We should also set the branch protection on `main` so that High or Critical findings block the PR from merging

## Still to do

| Step | Plan |
|---|---|
| Unit tests | Add a `pytest` step. The API tests go in `api_tests/` (currently empty) |
| SCA | Add `pip-audit -r requirements.txt`. It lists any dependency + version with a known vulnerability, its ID and the fixed version to upgrade to. `pip-audit` is already in `requirements-dev.txt` |
| Extra SAST | Add `bandit -r src`. Also already in `requirements-dev.txt` |
| DAST | Start the API in the pipeline with uvicorn, then run an OWASP ZAP API scan against it. Test bad input, extra parameters, broken requests and check no stack traces get shown |
| Evidence | Plant a known issue (e.g. a hardcoded password or SQL built from a string), screenshot the finding, fix it, screenshot the clean run. Save these in `docs/evidence/` |

## What should block a merge

| Check | Blocks? |
|---|---|
| Build fails | Yes |
| Unit tests fail | Yes |
| CodeQL / Bandit High or Critical | Yes |
| CodeQL / Bandit Medium or Low | No, but make an issue for it |
| pip-audit finds a vulnerability | Yes, unless there's no fix available yet (then make an issue) |
| ZAP High | Yes |
| ZAP Medium / Low | No, but make an issue for it |

## Security basics we follow

- No secrets in GitHub. `.env` and `*.db` are in `.gitignore`
- Only made-up (synthetic) data, no real customers
- All dependencies are pinned to exact versions in `requirements.txt`
- Every change goes through a PR and needs someone else to approve it
