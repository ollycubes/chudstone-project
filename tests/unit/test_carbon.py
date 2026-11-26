"""Unit tests for carbon_kg: amount spent x emission factor."""
from decimal import Decimal

import pytest

from api.main import carbon_kg
from api.seed import CATEGORIESSEED


@pytest.mark.parametrize(
    "amount, factor, expected",
    [
        (100, 0.2, 20.0),
        (12.5, 0.2, 2.5),
        (Decimal("12.50"), 0.2, 2.5),  # the form sends amounts as Decimal
        ("40", 0.55, 22.0),            # anything float() accepts works
        (0.01, 1.1, 0.011),            # smallest amount the form allows
        (1_000_000_000, 1.1, 1_100_000_000.0),  # biggest amount the form allows
    ],
)
def test_carbon_is_amount_times_factor(amount, factor, expected):
    assert carbon_kg(amount, factor) == pytest.approx(expected)


def test_carbon_avoids_float_rounding_error():
    # plain 0.1 * 3 in floats is 0.30000000000000004; carbon_kg should give exactly 0.3
    assert carbon_kg(3, 0.1) == 0.3
    assert carbon_kg(Decimal("0.10"), 3) == 0.3


def test_zero_factor_means_zero_carbon():
    assert carbon_kg(250, 0) == 0


def test_carbon_returns_a_float():
    assert isinstance(carbon_kg(Decimal("10.00"), 0.2), float)


@pytest.mark.parametrize("category, subcategory, factor", CATEGORIESSEED)
def test_every_seeded_factor_gives_a_sensible_result(category, subcategory, factor):
    assert carbon_kg(100, factor) == pytest.approx(100 * factor)


def test_bad_amount_raises():
    with pytest.raises(ValueError):
        carbon_kg("not a number", 0.2)
