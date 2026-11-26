"""Unit tests for api.seed: the sample data and the seed() function."""
import pytest

from api.main import carbon_kg
from api.models import Categories, Customers, MonthlySpendSubmissions
from api.seed import CATEGORIESSEED, CUSTOMERSSEED, seed
from api.submissionseed import SPENDSUBMISSIONSSEED


# ---------- the sample data itself ----------

def test_seed_subcategories_are_unique():
    subs = [sub for _cat, sub, _factor in CATEGORIESSEED]
    assert len(subs) == len(set(subs))


def test_seed_emission_factors_are_positive():
    assert all(factor > 0 for _cat, _sub, factor in CATEGORIESSEED)


def test_seed_customer_ids_are_unique():
    ids = [cid for cid, _name in CUSTOMERSSEED]
    assert len(ids) == len(set(ids))


def test_seed_submissions_use_known_categories_and_customers():
    categories = {(cat, sub) for cat, sub, _f in CATEGORIESSEED}
    customers = {cid for cid, _name in CUSTOMERSSEED}
    for _sid, cid, _month, cat, sub, _notes, amount in SPENDSUBMISSIONSSEED:
        assert (cat, sub) in categories
        assert cid in customers
        assert amount > 0


# ---------- seed() ----------

def test_seed_fills_an_empty_database(empty_db):
    seed(empty_db)
    assert empty_db.query(Categories).count() == len(CATEGORIESSEED)
    assert empty_db.query(Customers).count() == len(CUSTOMERSSEED)
    assert empty_db.query(MonthlySpendSubmissions).count() == len(SPENDSUBMISSIONSSEED)


def test_seed_twice_does_not_duplicate(empty_db):
    seed(empty_db)
    seed(empty_db)
    assert empty_db.query(Categories).count() == len(CATEGORIESSEED)
    assert empty_db.query(Customers).count() == len(CUSTOMERSSEED)
    assert empty_db.query(MonthlySpendSubmissions).count() == len(SPENDSUBMISSIONSSEED)


def test_seed_leaves_existing_data_alone(empty_db):
    empty_db.add(Customers(customer_id=42, persona="Mine"))
    empty_db.commit()
    seed(empty_db)
    assert [(c.customer_id, c.persona) for c in empty_db.query(Customers)] == [(42, "Mine")]


def test_seeded_carbon_matches_carbon_kg(db):
    factors = {sub: factor for _cat, sub, factor in CATEGORIESSEED}
    for row in db.query(MonthlySpendSubmissions):
        assert row.carbon_impact == pytest.approx(carbon_kg(row.amount, factors[row.subcategory]))
