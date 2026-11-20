"""
Fixtures for the Playwright frontend tests in this folder.
These need Playwright installed and the site running, so they're skipped if Playwright isn't installed.
"""
import pytest

try:
    from playwright.sync_api import Page
except ImportError:
    # tells pytest not to collect the tests in this folder
    collect_ignore_glob = ["test_*.py"]
else:
    # Currentlyusing localhost URL for the form.html page
    URL = "http://127.0.0.1:5500/Website%20dir/form.html"

    @pytest.fixture
    def form_page(page: Page):
        page.goto(URL)
        return page
