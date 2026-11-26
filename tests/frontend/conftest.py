"""
Setup for the Playwright frontend tests in this folder.
These need Playwright installed and the app running on http://localhost:8000,
so they're skipped if Playwright isn't installed.
"""
try:
    import playwright  # noqa: F401
except ImportError:
    # tells pytest not to collect the tests in this folder
    collect_ignore_glob = ["test_*.py"]
