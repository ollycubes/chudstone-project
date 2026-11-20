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

## 3. Set up the database

We use **SQLite** for now, so there's no database server to install. The database is just a file at `src/api/app.db`. It isn't committed to GitHub, so everyone makes their own.

From the `src` folder run the seed script:

```
cd src
python -m api.seed
```

This makes the tables and fills them with the test categories, personas and some example spending.

The seed only fills tables that are empty. If you change the seed data you need to delete `src/api/app.db` and run it again.

To check the data is there:

```
python -m api.checkDB
```

## 4. Run the API

Still in the `src` folder:

```
uvicorn api.main:app --reload
```

Then open:

- http://localhost:8000 for the spending form
- http://localhost:8000/docs for the API docs

**Important:** if you delete and reseed the database while the API is running, stop it (Ctrl+C) and start it again. Otherwise it keeps reading the old deleted file.

## Configuration

There's nothing to configure yet: no passwords, keys or `.env` file. The database path is set in `src/api/database.py`.

When we add secrets later they'll go in a `.env` file (already in `.gitignore`) or Azure Key Vault, never in the code.

## Still to do

- T-SQL files in `infra/sql/` (`schema.sql` and `seed.sql`), as the brief asks for
- Terraform is a stretch goal
