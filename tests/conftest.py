"""
Shared pytest fixtures, automatically visible to ALL tests
"""
import pytest
from playwright.sync_api import Page

# Currentlyusing localhost URL for the form.html page 
URL = "http://127.0.0.1:5500/Website%20dir/form.html"


@pytest.fixture
def form_page(page: Page):
    page.goto(URL)
    return page