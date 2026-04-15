"""
Dimension data generators: Dim_Account, Dim_Actor, Dim_Product -> CSV.

Source: seeding_scripts/db_seed.py (lines 152-636)
Stripped of all database code. Each generator returns a list of dataclass records.
"""

import random
import string
from datetime import datetime, timedelta
from pathlib import Path

from .constants import (
    CLIENT_ACCOUNT_NAMES, CLIENT_SUB_TYPES,
    INTERNAL_ACCOUNT_NAMES, INTERNAL_SUB_TYPES,
    FRB_CODES, MLI_NUMBERS, ACCOUNT_COUNTRIES,
    FIRST_NAMES, LAST_NAMES,
    RISK_AREAS, BUSINESS_AREAS, BUSINESS_UNITS, TRADING_DESKS,
    BOND_TICKERS,
    ACTOR_ACCOUNT_NAME_MAP, ACTOR_PRODUCT_TYPES,
    BUSINESS_AREA_SUFFIX_MAP, INTERNAL_ORGANIZATION,
)
from .models import AccountRecord, ActorRecord, ProductRecord
from .csv_writer import write_csv


def _random_alphanumeric(rng: random.Random, length: int) -> str:
    """Generate random alphanumeric string."""
    chars = string.ascii_uppercase + string.digits
    return "".join(rng.choice(chars) for _ in range(length))


# =============================================================================
# ACCOUNT GENERATOR
# =============================================================================


class AccountGenerator:
    """Generates Dim_Account records."""

    def __init__(self, rng: random.Random):
        self.rng = rng
        self._gse_letter_index = 0

    def generate(self, count: int) -> list[AccountRecord]:
        """Generate account records with a mix of Client and Internal types."""
        accounts = []
        used_ids = set()
        used_numbers = set()

        # Distribution: ~70% Client, ~30% Internal
        client_count = max(1, int(count * 0.7))
        internal_count = max(1, count - client_count)

        for i in range(client_count):
            accounts.append(self._generate_client_account(i, used_ids, used_numbers))

        for i in range(internal_count):
            accounts.append(self._generate_internal_account(i, used_ids, used_numbers))

        return accounts

    def _generate_unique_id(self, used_ids: set, length: int = 6) -> str:
        while True:
            new_id = _random_alphanumeric(self.rng, length)
            if new_id not in used_ids:
                used_ids.add(new_id)
                return new_id

    def _generate_unique_number(self, used_numbers: set, length: int = 8) -> str:
        while True:
            new_num = _random_alphanumeric(self.rng, length)
            if new_num not in used_numbers:
                used_numbers.add(new_num)
                return new_num

    def _generate_client_account(self, index, used_ids, used_numbers) -> AccountRecord:
        organization = self.rng.choice(CLIENT_ACCOUNT_NAMES)
        if index >= len(CLIENT_ACCOUNT_NAMES):
            organization = f"{organization} {index + 1}"
        sub_type = self.rng.choice(CLIENT_SUB_TYPES)

        # Determine account_id and account_number based on organization
        if "Agency" in organization and sub_type == "GSE":
            letter = string.ascii_uppercase[self._gse_letter_index % 26]
            self._gse_letter_index += 1
            account_id = f"GSE{letter}"
            if account_id in used_ids:
                account_id = self._generate_unique_id(used_ids)
            else:
                used_ids.add(account_id)
            account_number = f"GSE{self.rng.randint(100000, 999999)}"
            if account_number in used_numbers:
                account_number = self._generate_unique_number(used_numbers)
            else:
                used_numbers.add(account_number)
        elif "Agency" in organization:
            account_id = self._generate_unique_id(used_ids)
            account_number = f"GSE{self.rng.randint(100000, 999999)}"
            if account_number in used_numbers:
                account_number = self._generate_unique_number(used_numbers)
            else:
                used_numbers.add(account_number)
        else:
            account_id = self._generate_unique_id(used_ids)
            account_number = self._generate_unique_number(used_numbers)

        return AccountRecord(
            account_id=account_id,
            account_country=self.rng.choice(ACCOUNT_COUNTRIES),
            account_frb_code=self.rng.choice(FRB_CODES),
            account_mli_number=self.rng.choice(MLI_NUMBERS),
            account_organization=organization,
            account_name=organization,
            account_number=account_number,
            account_type="Client",
            account_sub_type=sub_type,
        )

    def _generate_internal_account(self, index, used_ids, used_numbers) -> AccountRecord:
        name = INTERNAL_ACCOUNT_NAMES[index % len(INTERNAL_ACCOUNT_NAMES)]
        if index >= len(INTERNAL_ACCOUNT_NAMES):
            name = f"{name} {index + 1}"
        account_number = f"BANK{self.rng.randint(0, 9999):04d}"
        if account_number in used_numbers:
            account_number = self._generate_unique_number(used_numbers)
        else:
            used_numbers.add(account_number)
        return AccountRecord(
            account_id=self._generate_unique_id(used_ids),
            account_country=self.rng.choice(ACCOUNT_COUNTRIES),
            account_frb_code=self.rng.choice(FRB_CODES),
            account_mli_number=self.rng.choice(MLI_NUMBERS),
            account_organization=INTERNAL_ORGANIZATION,
            account_name=name,
            account_number=account_number,
            account_type="Internal",
            account_sub_type=self.rng.choice(INTERNAL_SUB_TYPES),
        )


# =============================================================================
# ACTOR GENERATOR
# =============================================================================


class ActorGenerator:
    """Generates Dim_Actor records. Decoupled from accounts."""

    def __init__(self, rng: random.Random):
        self.rng = rng

    def generate(self, count: int) -> list[ActorRecord]:
        """Generate actor records: Sales, Internal Trader, Clerk."""
        actors = []
        used_trader_ids = set()

        # Distribution: ~33% Sales, ~40% Internal Trader, ~27% Clerk
        sales_count = max(1, int(count * 0.33))
        internal_trader_count = max(1, int(count * 0.40))
        clerk_count = max(1, count - sales_count - internal_trader_count)

        sales_num = 1
        trader_num = 1
        other_num = 1

        for _ in range(sales_count):
            actors.append(self._generate_sales_actor(sales_num, used_trader_ids))
            sales_num += 1

        for _ in range(internal_trader_count):
            actors.append(self._generate_internal_trader(trader_num, used_trader_ids))
            trader_num += 1

        for _ in range(clerk_count):
            actors.append(self._generate_clerk(other_num, used_trader_ids))
            other_num += 1

        return actors

    def _generate_name(self) -> str:
        return f"{self.rng.choice(FIRST_NAMES)} {self.rng.choice(LAST_NAMES)}"

    def _generate_email(self, name: str, domain: str = "company.com") -> str:
        parts = name.lower().split()
        return f"{parts[0]}.{parts[1]}@{domain}"

    def _generate_unique_trader_id(self, prefix: str, num: int, used_ids: set) -> str:
        trader_id = f"{prefix}{num}"
        while trader_id in used_ids:
            num += 1
            trader_id = f"{prefix}{num}"
        used_ids.add(trader_id)
        return trader_id

    def _generate_actor_account_id(self, business_unit: str, business_area: str) -> str:
        suffix = BUSINESS_AREA_SUFFIX_MAP.get(business_area, "1")
        return f"{business_unit}{suffix}"

    def _generate_standard_id(self) -> str:
        return "Y" + _random_alphanumeric(self.rng, 7)

    def _generate_sales_actor(self, num: int, used_ids: set) -> ActorRecord:
        name = self._generate_name()
        business_area = self.rng.choice(BUSINESS_AREAS)
        business_unit = self.rng.choice(BUSINESS_UNITS)
        product_type = self.rng.choice(ACTOR_PRODUCT_TYPES)
        account_name = self.rng.choice(ACTOR_ACCOUNT_NAME_MAP[product_type])

        if account_name == "Back Office":
            risk_area = "N/A"
            trading_desk = "N/A"
        else:
            risk_area = self.rng.choice(RISK_AREAS)
            trading_desk = self.rng.choice(TRADING_DESKS)

        return ActorRecord(
            actor_trader_id=self._generate_unique_trader_id("Sales", num, used_ids),
            actor_account_id=self._generate_actor_account_id(business_unit, business_area),
            actor_account_name=account_name,
            actor_email_address=self._generate_email(name),
            actor_trader_name=name,
            actor_position="Sales",
            actor_risk_area=risk_area,
            actor_standard_id=self._generate_standard_id(),
            actor_organization=INTERNAL_ORGANIZATION,
            actor_business_area=business_area,
            actor_business_unit_name=business_unit,
            actor_trading_desk=trading_desk,
            actor_product_type=product_type,
            actor_category="Internal",
        )

    def _generate_internal_trader(self, num: int, used_ids: set) -> ActorRecord:
        name = self._generate_name()
        business_area = self.rng.choice(BUSINESS_AREAS)
        business_unit = self.rng.choice(BUSINESS_UNITS)
        product_type = self.rng.choice(ACTOR_PRODUCT_TYPES)
        account_name = self.rng.choice(ACTOR_ACCOUNT_NAME_MAP[product_type])

        if account_name == "Back Office":
            risk_area = "N/A"
            trading_desk = "N/A"
        else:
            risk_area = self.rng.choice(RISK_AREAS)
            trading_desk = self.rng.choice(TRADING_DESKS)

        return ActorRecord(
            actor_trader_id=self._generate_unique_trader_id("TraderID", num, used_ids),
            actor_account_id=self._generate_actor_account_id(business_unit, business_area),
            actor_account_name=account_name,
            actor_email_address=self._generate_email(name),
            actor_trader_name=name,
            actor_position="Trader",
            actor_risk_area=risk_area,
            actor_standard_id=self._generate_standard_id(),
            actor_organization=INTERNAL_ORGANIZATION,
            actor_business_area=business_area,
            actor_business_unit_name=business_unit,
            actor_trading_desk=trading_desk,
            actor_product_type=product_type,
            actor_category="Internal",
        )

    def _generate_clerk(self, num: int, used_ids: set) -> ActorRecord:
        name = self._generate_name()
        business_area = self.rng.choice(BUSINESS_AREAS)
        business_unit = self.rng.choice(BUSINESS_UNITS)
        # Clerk is always Back Office, which is only under Corporate Bond
        account_name = "Back Office"
        product_type = "Corporate Bond"

        return ActorRecord(
            actor_trader_id=self._generate_unique_trader_id("OtherID", num, used_ids),
            actor_account_id=self._generate_actor_account_id(business_unit, business_area),
            actor_account_name=account_name,
            actor_email_address=self._generate_email(name),
            actor_trader_name=name,
            actor_position="Clerk",
            actor_risk_area="N/A",
            actor_standard_id=self._generate_standard_id(),
            actor_organization=INTERNAL_ORGANIZATION,
            actor_business_area=business_area,
            actor_business_unit_name=business_unit,
            actor_trading_desk="N/A",
            actor_product_type=product_type,
            actor_category="Internal",
        )


# =============================================================================
# PRODUCT GENERATOR
# =============================================================================


class ProductGenerator:
    """Generates Dim_Product records."""

    def __init__(self, rng: random.Random):
        self.rng = rng

    def generate(self, count: int) -> list[ProductRecord]:
        """Generate product records: Corporate, Government, Agency."""
        products = []
        used_isins = set()

        corporate_count = max(1, int(count * 0.40))
        government_count = max(1, int(count * 0.40))
        agency_count = max(1, count - corporate_count - government_count)

        for i in range(corporate_count):
            products.append(self._generate_corporate_bond(i, used_isins))
        for i in range(government_count):
            products.append(self._generate_government_bond(i, used_isins))
        for i in range(agency_count):
            products.append(self._generate_agency_security(used_isins))

        return products

    def _generate_unique_isin(self, used_isins: set) -> str:
        while True:
            isin = _random_alphanumeric(self.rng, 12)
            if isin not in used_isins:
                used_isins.add(isin)
                return isin

    def _generate_dates(self) -> tuple[datetime, datetime]:
        today = datetime.now()
        issue_date = today - timedelta(days=self.rng.randint(0, 5 * 365))
        maturity_date = issue_date + timedelta(days=(10 * 365) - 3)
        return issue_date, maturity_date

    def _generate_corporate_bond(self, index: int, used_isins: set) -> ProductRecord:
        ticker = BOND_TICKERS[index % len(BOND_TICKERS)]
        coupon = round(self.rng.uniform(2.0, 8.0), 2)
        issue_date, maturity_date = self._generate_dates()
        isin = self._generate_unique_isin(used_isins)
        desc_short = f"{ticker} {coupon}% {maturity_date.strftime('%m/%d/%y')}"
        desc_long = f"{ticker} Corporate Bond {coupon}% Due {maturity_date.strftime('%B %d, %Y')}"
        return ProductRecord(
            product_isin=isin,
            product_bbgid=isin,
            product_country_of_issue="US",
            product_currency_of_issue="USD",
            product_cusip=isin[:9],
            product_description_long=desc_long,
            product_description_short=desc_short,
            product_issue_date=issue_date.strftime("%m/%d/%y"),
            product_maturity_date=maturity_date.strftime("%m/%d/%y"),
            product_category="Debt",
            product_type="Corporate Bond",
            product_sub_type="Corporate Bond",
        )

    def _generate_government_bond(self, index: int, used_isins: set) -> ProductRecord:
        coupon = round(self.rng.uniform(1.0, 5.0), 2)
        issue_date, maturity_date = self._generate_dates()
        isin = self._generate_unique_isin(used_isins)
        desc_short = f"US Treasury {coupon}% {maturity_date.strftime('%m/%d/%y')}"
        desc_long = f"US Treasury Bond {coupon}% Due {maturity_date.strftime('%B %d, %Y')}"
        return ProductRecord(
            product_isin=isin,
            product_bbgid=isin,
            product_country_of_issue="US",
            product_currency_of_issue="USD",
            product_cusip=isin[:9],
            product_description_long=desc_long,
            product_description_short=desc_short,
            product_issue_date=issue_date.strftime("%m/%d/%y"),
            product_maturity_date=maturity_date.strftime("%m/%d/%y"),
            product_category="Debt",
            product_type="Government Bond",
            product_sub_type="Government Bond",
        )

    def _generate_agency_security(self, used_isins: set) -> ProductRecord:
        letter = self.rng.choice(string.ascii_uppercase)
        coupon = round(self.rng.uniform(2.0, 6.0), 2)
        issue_date, maturity_date = self._generate_dates()
        isin = self._generate_unique_isin(used_isins)
        desc = f"Agency Bond {letter} {coupon}% {maturity_date.strftime('%m/%d/%y')}"
        return ProductRecord(
            product_isin=isin,
            product_bbgid=isin,
            product_country_of_issue="US",
            product_currency_of_issue="USD",
            product_cusip=isin[:9],
            product_description_long=desc,
            product_description_short=desc,
            product_issue_date=issue_date.strftime("%m/%d/%y"),
            product_maturity_date=maturity_date.strftime("%m/%d/%y"),
            product_category="Debt",
            product_type="Agency Security",
            product_sub_type="Agency Security",
        )


# =============================================================================
# PUBLIC API
# =============================================================================


def generate_dimensions(
    rng: random.Random,
    output_dir: Path,
    account_count: int = 10,
    actor_count: int = 20,
    product_count: int = 15,
):
    """
    Generate dimension CSVs.

    Returns (accounts, actors, products) lists for downstream generators.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate accounts
    print(f"  Generating {account_count} accounts...")
    account_gen = AccountGenerator(rng)
    accounts = account_gen.generate(account_count)
    print(f"    Generated: {len(accounts)} accounts")

    # Generate actors (decoupled from accounts)
    print(f"  Generating {actor_count} actors...")
    actor_gen = ActorGenerator(rng)
    actors = actor_gen.generate(actor_count)
    print(f"    Generated: {len(actors)} actors")

    # Generate products
    print(f"  Generating {product_count} products...")
    product_gen = ProductGenerator(rng)
    products = product_gen.generate(product_count)
    print(f"    Generated: {len(products)} products")

    # Write CSVs
    write_csv(accounts, output_dir / "dim_account.csv")
    print(f"  dim_account.csv: {len(accounts)} records")

    write_csv(actors, output_dir / "dim_actor.csv")
    print(f"  dim_actor.csv: {len(actors)} records")

    write_csv(products, output_dir / "dim_product.csv")
    print(f"  dim_product.csv: {len(products)} records")

    return accounts, actors, products
