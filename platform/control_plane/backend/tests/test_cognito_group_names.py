"""The group name the auth code demands must be the group name Cognito actually has.

`require_admin` in core/security.py demanded membership of "admins". The Cognito
Terraform (infrastructure/modules/cognito/main.tf) creates "admin", "operator" and
"viewer" - all singular. So against a real pool the check could not pass for anybody,
including a correctly configured administrator: the token said "admin", the code wanted
"admins", and the caller got a 403 that looked exactly like a permissions problem.

It survived because core/dev_auth.py was wrong in the same direction. It minted a mock
admin in a group named "admins" and then checked for "admins", so the dev bypass agreed
with itself and nothing ever disagreed with production. Local dev passed; deployment
failed closed. No test caught it because every test that could have was written against
the same wrong constant.

That is the whole point of parsing the Terraform here rather than writing the correct
string into this file. A test that asserts `ADMIN_GROUP == "admin"` re-encodes the
constant a second time and would have passed just as happily when both copies said
"admins". These tests compare the auth code against the thing that decides the outcome -
the resource that creates the group - so the two cannot drift apart again silently.

Scope note: applications/reference_implementations/agentcore-in-a-box is a DIFFERENT
deployment with its own pool, and it genuinely creates a group named "admins"
(_deploy_internal.sh) and genuinely checks "admins". It is self-consistent and correct.
Nothing here applies to it.
"""

from __future__ import annotations

import ast
import re
import sys
import types
from pathlib import Path
from typing import Dict, List

import pytest

try:  # pragma: no cover - depends on the host, not on the code under test
    import jose  # noqa: F401
except ModuleNotFoundError:
    # python-jose is pinned in requirements.txt and present in the backend image, but is
    # not installed on every dev host, and core.security imports it at module scope.
    # Same PyJWT-backed shim tests/test_security_jwks.py installs, and for the same
    # reason; whichever module pytest imports first installs it and the other finds it.
    # Nothing under test here touches a JWT: require_admin reads a list of group names.
    import jwt as _pyjwt

    _jose = types.ModuleType("jose")
    _jose_jwt = types.ModuleType("jose.jwt")
    _jose_jwt.get_unverified_header = _pyjwt.get_unverified_header
    _jose_jwt.decode = _pyjwt.decode
    _jose.jwt = _jose_jwt
    _jose.JWTError = _pyjwt.exceptions.PyJWTError
    sys.modules["jose"] = _jose
    sys.modules["jose.jwt"] = _jose_jwt

from fastapi import HTTPException  # noqa: E402

from core import cognito_groups, rbac  # noqa: E402
from core.cognito_groups import (  # noqa: E402
    ADMIN_GROUP,
    OPERATOR_GROUP,
    VIEWER_GROUP,
)
from core.dev_auth import DEV_USERS, DevUser, require_admin_dev  # noqa: E402
from core.security import require_admin  # noqa: E402

_BACKEND = Path(__file__).resolve().parents[1]
_INFRA_ROOT = _BACKEND.parent / "infrastructure"
_COGNITO_TF = _INFRA_ROOT / "modules" / "cognito" / "main.tf"

# Every module that decides an authorization outcome by comparing against a Cognito
# group name. core/auth.py re-exports one of the first two depending on USE_DEV_AUTH, so
# a disagreement between them is a difference between environments, not a style nit.
_SECURITY_PY = _BACKEND / "src" / "core" / "security.py"
_DEV_AUTH_PY = _BACKEND / "src" / "core" / "dev_auth.py"
_RBAC_PY = _BACKEND / "src" / "core" / "rbac.py"
_AUTH_MODULES = (_SECURITY_PY, _DEV_AUTH_PY, _RBAC_PY)

# The spellings this bug used. Not an exhaustive list of wrong names - it is the specific
# regression, kept so a revert is caught by name.
_PLURAL_SPELLINGS = frozenset({"admins", "operators", "viewers"})

# A block of `resource "aws_cognito_user_group" "<label>" { ... }` with no nested braces,
# which is true of all three today. Non-greedy up to the first closing brace, and the
# helper below refuses to return a suspiciously small result, so a Terraform rewrite that
# defeats this pattern fails the tests rather than emptying them.
_GROUP_BLOCK = re.compile(
    r'resource\s+"aws_cognito_user_group"\s+"(?P<label>[^"]+)"\s*\{(?P<body>[^{}]*)\}'
)
_NAME_ATTR = re.compile(r'^\s*name\s*=\s*"(?P<name>[^"]*)"\s*$', re.MULTILINE)


def _terraform_cognito_groups() -> Dict[str, str]:
    """Resource label -> the `name` Cognito will actually see, read from the Terraform.

    Deliberately loud rather than lenient. A vacuous parse - file moved, syntax changed,
    regex outgrown - would turn every assertion below into a tautology over an empty set,
    which is the same "reassuring answer where no measurement happened" failure the bug
    itself was.
    """
    # Two different absences, and conflating them is what makes a suite lie in one
    # direction or the other.
    #
    # No `infrastructure/` tree at all means this is not a repo checkout - the backend
    # runtime image COPYs src/, schemas/ and templates/ but deliberately not Terraform, so
    # `tests/` bind-mounted into /app resolves _BACKEND to /app and this path to
    # /infrastructure. There is nothing to compare against and nothing is wrong; asserting
    # here just paints 13 tests red in every containerised run, which trains people to read
    # red as normal. Skip, and say why.
    if not _INFRA_ROOT.is_dir():
        pytest.skip(
            f"No Terraform tree at {_INFRA_ROOT} - this is a runtime image, not a repo "
            "checkout, so there is no infrastructure to compare the auth constants "
            "against. Run these on a checkout (or bind-mount infrastructure/) to gate the "
            "comparison."
        )

    # The tree IS here and the file is not: that is a move or a delete, exactly the drift
    # these tests exist to catch. Stay loud.
    assert _COGNITO_TF.is_file(), (
        f"The Cognito Terraform is not at {_COGNITO_TF}, but {_INFRA_ROOT} exists. These "
        "tests compare the auth code against it; if it moved, point them at the new "
        "location rather than deleting them."
    )
    text = _COGNITO_TF.read_text(encoding="utf-8")

    groups: Dict[str, str] = {}
    for match in _GROUP_BLOCK.finditer(text):
        name = _NAME_ATTR.search(match.group("body"))
        assert name, (
            f'aws_cognito_user_group "{match.group("label")}" has no literal `name` '
            "attribute this test can read."
        )
        groups[match.group("label")] = name.group("name")

    assert len(groups) >= 3, (
        f"Parsed only {len(groups)} aws_cognito_user_group resources from "
        f"{_COGNITO_TF.name}; expected at least the three RBAC groups. The parse, not "
        "the infrastructure, is the likely problem - fix it before trusting a pass."
    )
    return groups


def _string_constants(path: Path) -> List[str]:
    """Every string literal in a module, from the AST rather than a text search.

    A text search for "admins" hits the comments explaining the bug, so the fix would
    look like the bug. The AST sees only literals, and the check below is exact
    equality, so prose that mentions a plural group is free to keep mentioning it.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    ]


def _group_literals(path: Path) -> tuple[int, List[str]]:
    """(membership tests against a groups collection, the string literals they use).

    Two shapes, both from the AST rather than a text scan:

      * `<literal> in|not in <anything mentioning groups>` - which covers
        `"x" not in user.get("groups", [])` and `"x" not in user.groups` and
        `"x" in groups` alike, so a refactor between them does not slip past,
      * a `groups=[...]` keyword argument, which is how core/dev_auth.py mints the
        membership its own check then reads.

    A plain "does this file contain the string" search cannot do this job: the mock admin
    in core/dev_auth.py has `username="admin"`, and a username is not a group. That
    literal is correct and must not be flagged.

    The count is returned so the caller can refuse to pass on an empty reading. An
    extractor that silently stops recognising the check would otherwise report a clean
    file for every possible defect.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    sites = 0
    literals: List[str] = []

    def _strings(node: ast.AST) -> List[str]:
        return [
            child.value
            for child in ast.walk(node)
            if isinstance(child, ast.Constant) and isinstance(child.value, str)
        ]

    for node in ast.walk(tree):
        if isinstance(node, ast.Compare) and any(
            isinstance(op, (ast.In, ast.NotIn)) for op in node.ops
        ):
            if any("groups" in ast.unparse(c) for c in node.comparators):
                sites += 1
                literals.extend(_strings(node.left))
        elif isinstance(node, ast.keyword) and node.arg == "groups":
            sites += 1
            literals.extend(_strings(node.value))

    return sites, literals


def _dict_user(groups: List[str]) -> Dict[str, object]:
    """The shape core/security.py's get_current_user hands to require_admin."""
    return {
        "sub": "sub-1",
        "user_id": "sub-1",
        "username": "someone",
        "email": "someone@example.com",
        "groups": groups,
    }


def _dev_user(groups: List[str]) -> DevUser:
    """The shape core/dev_auth.py's get_current_user_dev hands to require_admin_dev."""
    return DevUser(
        user_id="dev-1",
        username="someone",
        email="someone@example.com",
        groups=groups,
    )


# ---------------------------------------------------------------------------
# What the infrastructure actually declares
# ---------------------------------------------------------------------------


def test_the_terraform_declares_the_three_rbac_groups_by_label():
    """Non-vacuity guard for everything below, plus the labels those tests index by."""
    groups = _terraform_cognito_groups()
    assert {"admin", "operator", "viewer"} <= set(groups), (
        "Expected aws_cognito_user_group resources labelled admin/operator/viewer; "
        f"found {sorted(groups)}."
    )
    assert all(name for name in groups.values()), f"Empty group name in {groups}."


def test_no_cognito_group_is_actually_named_in_the_plural():
    """The premise of the fix, stated against the Terraform.

    If someone ever renames the Cognito group to "admins" instead, this fails and points
    at the auth constants, rather than leaving the two halves to disagree quietly again.
    """
    names = set(_terraform_cognito_groups().values())
    assert not (names & _PLURAL_SPELLINGS), (
        f"Terraform now creates {sorted(names & _PLURAL_SPELLINGS)}; core/security.py's "
        "group constants say otherwise."
    )


# ---------------------------------------------------------------------------
# The constants, against the infrastructure
# ---------------------------------------------------------------------------


def test_the_admin_group_constant_is_the_group_terraform_creates():
    groups = _terraform_cognito_groups()
    assert ADMIN_GROUP == groups["admin"], (
        f"cognito_groups.ADMIN_GROUP is {ADMIN_GROUP!r} but Terraform creates "
        f"{groups['admin']!r}. Every require_admin call is a guaranteed 403."
    )


def test_the_viewer_group_constant_is_the_group_terraform_creates():
    groups = _terraform_cognito_groups()
    assert VIEWER_GROUP == groups["viewer"]


def test_the_operator_group_constant_is_the_group_terraform_creates():
    groups = _terraform_cognito_groups()
    assert OPERATOR_GROUP == groups["operator"]


def test_the_constants_are_exactly_the_groups_terraform_creates():
    """Set equality, so a group added to the pool cannot go unmentioned here either."""
    declared = {
        value
        for name, value in vars(cognito_groups).items()
        if name.endswith("_GROUP") and isinstance(value, str)
    }
    assert declared == set(_terraform_cognito_groups().values())


@pytest.mark.parametrize("module", _AUTH_MODULES, ids=lambda p: p.name)
def test_every_group_name_the_auth_code_tests_for_is_a_group_that_exists(module):
    """The one assertion that fails on the original code, in all three modules at once.

    Before the fix this reported "admins" for core/security.py and "admins"/"viewers"
    for core/dev_auth.py, none of which Cognito creates. core/rbac.py reports
    "admin"/"operator" and passes, which is exactly the disagreement nobody could see.
    """
    names = set(_terraform_cognito_groups().values())
    sites, literals = _group_literals(module)
    assert sites, (
        f"No group-membership test found in {module.name}. The extractor has stopped "
        "recognising the check, so a pass here means nothing - fix it before trusting it."
    )
    phantom = sorted(set(literals) - names)
    assert not phantom, (
        f"{module.name} tests for membership of {phantom}, which no aws_cognito_user_group "
        f"creates. The real groups are {sorted(names)}."
    )


def test_neither_module_that_drifted_still_carries_a_group_literal():
    """The two files that used to disagree must have no literal left to drift.

    This is what makes the fix structural rather than a one-time correction: with no
    group literal in either file, there is a single string in core/cognito_groups.py for
    the Terraform comparisons above to check.

    core/rbac.py is deliberately excluded. It still compares against its own
    "admin"/"operator" literals, which the test above holds to the Terraform; moving them
    means editing a module this change does not own.
    """
    for module in (_SECURITY_PY, _DEV_AUTH_PY):
        _sites, literals = _group_literals(module)
        assert not literals, (
            f"{module.name} spells out the group name(s) {sorted(set(literals))} instead "
            "of importing them from core.cognito_groups, which is how the two spellings "
            "drifted apart in the first place."
        )


def test_the_rbac_role_ladder_is_keyed_by_the_terraform_group_names():
    """core/rbac.py maps a group name to a Role, so the same drift breaks it too.

    Set equality, not containment: a ROLE_MAP key that no group creates grants nothing,
    and a group with no key silently reads as VIEWER.
    """
    names = set(_terraform_cognito_groups().values())
    assert set(rbac.ROLE_MAP) == names, (
        f"rbac.ROLE_MAP keys {sorted(rbac.ROLE_MAP)} != Cognito groups {sorted(names)}."
    )


def test_no_auth_module_contains_a_plural_group_literal():
    """Catches a partial revert, including in modules with no constant to import.

    rbac._extract_role compares against its own literals; this is what holds them to
    the same names without a second copy of the constant.
    """
    for module in _AUTH_MODULES:
        offenders = sorted(set(_string_constants(module)) & _PLURAL_SPELLINGS)
        assert not offenders, (
            f"{module.name} contains the group literal(s) {offenders}, which Cognito "
            "does not create."
        )


# ---------------------------------------------------------------------------
# The behaviour: does a real administrator get in
# ---------------------------------------------------------------------------


def test_a_user_in_the_real_admin_group_passes_require_admin():
    """The case that was broken for every deployed administrator."""
    admin_group = _terraform_cognito_groups()["admin"]
    user = _dict_user([admin_group])
    assert require_admin(user=user) is user


def test_admin_group_membership_alongside_other_groups_still_passes():
    admin_group = _terraform_cognito_groups()["admin"]
    user = _dict_user(["some-idp-group", admin_group, "another"])
    assert require_admin(user=user) is user


@pytest.mark.parametrize(
    "groups",
    [
        pytest.param([], id="no-groups"),
        pytest.param(["viewer"], id="viewer-only"),
        pytest.param(["operator"], id="operator-only"),
        pytest.param(["admins"], id="the-plural-that-caused-this"),
        pytest.param(["Admin"], id="wrong-case-cognito-groups-are-case-sensitive"),
        pytest.param(["administrator"], id="prefix-lookalike"),
    ],
)
def test_a_user_without_the_admin_group_gets_403(groups):
    with pytest.raises(HTTPException) as excinfo:
        require_admin(user=_dict_user(groups))
    assert excinfo.value.status_code == 403


def test_a_claims_payload_with_no_groups_key_at_all_gets_403():
    """A Cognito token for a user in no group carries no `cognito:groups` claim, so
    get_current_user yields an empty list - but a caller assembling the dict by hand
    could omit the key entirely, and that must not raise a 500 or pass."""
    with pytest.raises(HTTPException) as excinfo:
        require_admin(user={"sub": "sub-1"})
    assert excinfo.value.status_code == 403


# ---------------------------------------------------------------------------
# The behaviour: does the dev bypass still stand in for production
# ---------------------------------------------------------------------------


def test_every_seeded_dev_user_carries_only_groups_that_exist():
    """The mock's own groups, against the Terraform.

    This is the assertion that fails on the original code: the seeded admin was in
    "admins" and the seeded viewer in "viewers", and no such groups exist.
    """
    names = set(_terraform_cognito_groups().values())
    for email, user in DEV_USERS.items():
        unknown = sorted(set(user.groups) - names)
        assert not unknown, f"Dev user {email} is in non-existent group(s) {unknown}."


def test_the_seeded_dev_admin_passes_require_admin_dev():
    user = DEV_USERS["admin@example.com"]
    assert require_admin_dev(user=user) is user


def test_the_seeded_dev_admin_would_also_pass_the_real_check():
    """The property the bug violated.

    The dev admin passed require_admin_dev and would have been refused by
    require_admin, which is precisely why the defect could not be seen locally.
    """
    user = DEV_USERS["admin@example.com"]
    assert require_admin(user={"groups": user.groups}) is not None


def test_the_seeded_dev_viewer_gets_403_from_require_admin_dev():
    with pytest.raises(HTTPException) as excinfo:
        require_admin_dev(user=DEV_USERS["demo@example.com"])
    assert excinfo.value.status_code == 403


@pytest.mark.parametrize(
    "groups",
    [
        pytest.param(["admin"], id="real-admin-group"),
        pytest.param(["viewer"], id="real-viewer-group"),
        pytest.param(["operator"], id="real-operator-group"),
        pytest.param(["admins"], id="plural-admin"),
        pytest.param([], id="no-groups"),
        pytest.param(["admin", "viewer"], id="admin-plus-viewer"),
    ],
)
def test_the_dev_check_and_the_real_check_reach_the_same_verdict(groups):
    """A dev bypass that admits somebody production refuses is worse than none.

    The two are written against the same constant now, but they are still two functions
    in two modules selected by an environment variable, and this is the invariant that
    makes swapping them safe.
    """

    def verdict(call) -> bool:
        try:
            call()
        except HTTPException as exc:
            assert exc.status_code == 403
            return False
        return True

    real = verdict(lambda: require_admin(user=_dict_user(list(groups))))
    dev = verdict(lambda: require_admin_dev(user=_dev_user(list(groups))))
    assert real == dev, (
        f"groups={groups!r}: require_admin says {real}, require_admin_dev says {dev}."
    )
