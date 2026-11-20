# Definition of Done (DoD)

A task is "done" when:

- [ ] All the acceptance criteria on the issue are met
- [ ] Code is on its own branch, named using our conventions (`feat/`, `fix/`, `docs/`, `chore/`)
- [ ] A PR has been opened using the PR template
- [ ] At least one other person has reviewed and approved it (you can't approve your own)
- [ ] The DevSecOps pipeline passes (build + CodeQL)
- [ ] It's been tested locally and works
- [ ] No secrets, `.env` files, `.db` files or real customer data are committed
- [ ] Any new dependencies are pinned in `requirements.txt`
- [ ] Docs are updated if something changed (e.g. `docs/api.md` if an endpoint changed)
- [ ] It's merged into `main` and the issue is closed
