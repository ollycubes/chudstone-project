# Runbook

How to get the project running on your own machine.

## What you need

- Python 3.14
- Git

## 1. Get the code

```
git clone https://github.com/ollycubes/chudstone-project.git
cd chudstone-project
```

## 2. Make a virtual environment and install packages

Mac / Linux:

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Windows:

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
```

## 3. Connect to the database

We use a shared **Azure PostgreSQL** database called `chudstone`, on the server `t2capstonedatabaseserver.postgres.database.azure.com`. Everyone on the team reads and writes the same data.

To connect, copy `.env.example` to `.env` in the repo root.

Mac / Linux:

```
cp .env.example .env
```

Windows:

```
Copy-Item .env.example .env
```

Then open `.env` and put in the username and password (ask the team for them):

```
DATABASE_URL=postgresql+psycopg://USERNAME:PASSWORD@t2capstonedatabaseserver.postgres.database.azure.com:5432/chudstone?sslmode=require
```

- `.env` is in `.gitignore`. **Never commit it.**
- The database name at the end must be `chudstone`, not `postgres`.
- If the password has special characters (`@ : / ? # % &` etc.) they must be URL-encoded, e.g. `@` becomes `%40`.
- Your IP address must be allowed in the Azure server's **Networking → Firewall rules**, or the connection will time out.

**No `.env`?** Then the app falls back to a local SQLite file at `src/api/app.db` (made automatically, not committed). This is what the pipeline uses. If your app suddenly seems to have "lost" its data, check that your `.env` is still there.

To check you're connected, from the `src` folder:

```
cd src
python -m api.checkDB
```

It prints the database type, host and name, then each table and how many rows it has. You should see `postgresql` and `chudstone`.

## 4. Seed the database

The Azure database is already seeded, so you normally don't need to do this. Still in the `src` folder:

```
python -m api.seed
```

This makes any missing tables and fills **empty** tables with the test categories, personas and some example spending. Tables that already have data are left alone.

To wipe the database and start again (for example after changing the seed data):

```
python -m api.seed --reset
```

It shows which database it's about to wipe and asks you to type its name before deleting anything. This deletes **all** data, including real submissions, and on Azure that's everyone's data, so tell the team first.

## 5. Run the API

Still in the `src` folder:

```
uvicorn api.main:app --reload
```

Then open:

- http://localhost:8000 for the spending form
- http://localhost:8000/docs for the API docs

**Important:** if you change `.env` while the API is running, stop it (Ctrl+C) and start it again. It only reads `.env` when it starts.

## 6. Run the tests

From the project root (not `src`):

```
pytest tests/api -v
```

The tests use their own in-memory database, so you don't need to seed anything or have the API running first, and they never touch Azure or your `app.db`.

The Playwright frontend tests in `tests/frontend/` are skipped unless Playwright is installed.

## Configuration

The database setting is `DATABASE_URL`, read in `src/api/database.py`:

| `DATABASE_URL` | Database used | Who uses it |
|---|---|---|
| Set (in `.env` or as an environment variable) | That database, i.e. Azure PostgreSQL | The team, locally |
| Not set | Local SQLite file `src/api/app.db` | The pipeline, or anyone without a `.env` |

A real environment variable wins over `.env`, so a hosted app could set `DATABASE_URL` directly.

The pipeline deliberately has no `DATABASE_URL`, so builds and security scans never write test data into the shared Azure database.

### Customer ID sessions

The persona picked in the dropdown is kept in a signed session cookie (`chudstone_session`), read in `src/api/main.py`. The API takes the customer from that cookie only, so changing an id in the URL or form can't show, edit or delete another customer ID spending.

| Setting | What it does |
|---|---|
| `SESSION_SECRET` | Signs the cookie. Set it to a long random string anywhere the app is hosted. If unset, a random one is made at startup, so everyone is signed out on every restart (fine locally). |
| `SESSION_HTTPS_ONLY` | Set to `1` when the site is served over https, so the cookie is never sent over plain http. |

## Looking at the data

To browse the Azure tables visually, use the **PostgreSQL** extension for VS Code (by Microsoft) or **pgAdmin**. Connect with the same server, username, password and database (`chudstone`) as your `.env`, on port `5432` with SSL set to require.

## Still to do

- Move the database password into Azure Key Vault
- Terraform is a stretch goal
