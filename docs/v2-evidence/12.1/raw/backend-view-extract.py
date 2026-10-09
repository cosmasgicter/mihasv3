#!/usr/bin/env python3
"""Split a backend view module by AST span, asserting byte-identity before writing.

Task 12.1, **second pass** (the backend half §9 deferred). This is the same
mechanism 12.1 §3.6 used for the wizard extraction, generalised to the two
catalog view modules, and for the same reason: 11.2 §10.1 re-authored a
validation function instead of lifting it and silently dropped a hydration guard,
a duplicate-subject error, an upload guard and six field labels — caught only by
other lanes' property tests. Nothing here is retyped.

For each target module the script:

1. parses the source module with :mod:`ast` and records every top-level
   definition's **exact source span**, extended upward over attached decorators
   and immediately-preceding comment lines (so a comment that explains a constant
   moves with it);
2. asserts each span's first line looks like a definition boundary
   (``@`` / ``class`` / ``def`` / ``#`` / ``NAME =``), so a mis-computed span
   fails loudly instead of moving the wrong code;
3. writes the target as ``header + hand-written imports + the spans, in source
   order``; and
4. re-reads what it wrote and asserts every moved span appears in it
   **byte-for-byte** before the extraction is allowed to count.

The import lists are written by hand — they are the moved code's own
dependencies, which no mechanical rule can infer once a module boundary changes —
and then verified by ``manage.py check`` plus the 187-case characterisation suite
in ``backend/tests/unit/test_catalog_view_characterisation_12_1.py``. This
script's job is only to guarantee the *bodies* are unmodified.

Run from the repository root:

    python3 docs/v2-evidence/12.1/raw/backend-view-extract.py --plan admin
    python3 docs/v2-evidence/12.1/raw/backend-view-extract.py --plan catalog
    python3 docs/v2-evidence/12.1/raw/backend-view-extract.py --plan verify
"""

from __future__ import annotations

import argparse
import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
CATALOG = ROOT / "backend" / "apps" / "catalog"

_BOUNDARY_PREFIXES = ("@", "class ", "def ", "#")


# ---------------------------------------------------------------------------
# Span extraction
# ---------------------------------------------------------------------------


def top_level_spans(path: pathlib.Path) -> dict[str, tuple[int, int]]:
    """``name -> (start, end)`` 1-based inclusive spans for top-level defs.

    A span starts at the first decorator's ``@`` (or the definition line) and is
    then extended upward over a contiguous run of comment lines, so an
    explanatory comment above a constant is part of the thing it explains.
    """
    source = path.read_text()
    lines = source.split("\n")
    tree = ast.parse(source)
    spans: dict[str, tuple[int, int]] = {}

    for node in tree.body:
        names: list[str] = []
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names = [node.name]
        elif isinstance(node, ast.Assign):
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names = [node.target.id]
        if not names:
            continue

        start = node.lineno
        decorators = getattr(node, "decorator_list", None) or []
        if decorators:
            # A decorator's ``lineno`` is its *expression*, usually on the
            # same line as the ``@`` but not always; walk back to the ``@``.
            start = min(d.lineno for d in decorators)
            while start > 1 and not lines[start - 1].lstrip().startswith("@"):
                start -= 1
        while start > 1 and lines[start - 2].lstrip().startswith("#"):
            start -= 1

        end = node.end_lineno
        assert end is not None
        for name in names:
            spans[name] = (start, end)

    return spans


def render(path: pathlib.Path, spans: dict[str, tuple[int, int]], names: list[str]) -> list[tuple[str, str]]:
    """``[(name, verbatim source text)]`` in source order, boundaries asserted."""
    lines = path.read_text().split("\n")
    ordered = sorted(names, key=lambda name: spans[name][0])
    out: list[tuple[str, str]] = []
    for name in ordered:
        start, end = spans[name]
        first = lines[start - 1]
        assert first.startswith(_BOUNDARY_PREFIXES) or "=" in first, (
            f"{name}: span starts at a non-boundary line {start}: {first!r}"
        )
        out.append((name, "\n".join(lines[start - 1 : end])))
    return out


def write_module(
    *,
    source: pathlib.Path,
    target: pathlib.Path,
    header: str,
    names: list[str],
    spans: dict[str, tuple[int, int]],
) -> None:
    blocks = render(source, spans, names)
    body = "\n\n\n".join(text for _, text in blocks)
    target.write_text(f"{header}\n\n{body}\n")

    written = target.read_text()
    for name, text in blocks:
        assert text in written, f"{name}: NOT byte-identical in {target.name}"
    print(
        f"  {target.name}: {len(blocks)} definitions byte-identical, "
        f"{len(written.split(chr(10))) - 1} lines"
    )


# ---------------------------------------------------------------------------
# The plans
# ---------------------------------------------------------------------------

ADMIN_PLAN: dict[str, list[str]] = {
    "_admin_view_helpers.py": [
        "_domain_not_verified_response",
        "_domain_transition_conflict_response",
        "_hostname_conflict_response",
        "_integrity_conflict_response",
        "_WRITE_CAPABILITY_BY_RESOURCE",
        "_write_allowed",
        "_write_capability_for_resource",
        "_forbidden_write_response",
        "_actor_id_str",
        "_self_mutation_forbidden_response",
        "_staff_invite_forbidden_response",
        "_scope_institution_ids",
        "_paginate",
        "_readable_institution_queryset",
        "_InstitutionChildListCreateView",
        "_InstitutionChildDetailView",
    ],
    "admin_tenant_views.py": [
        "AdminTenantListCreateView",
        "AdminTenantDetailView",
        "AdminTenantReadinessView",
        "AdminTenantProgramListView",
        "AdminTenantProgramDetailView",
    ],
    "admin_domain_views.py": [
        "AdminTenantDomainListCreateView",
        "AdminTenantDomainDetailView",
        "AdminTenantDomainActivateView",
        "_get_domain_or_404",
        "AdminTenantDomainRetryView",
        "AdminTenantDomainApproveView",
        "AdminTenantDomainRejectView",
        "AdminTenantDomainReactivateView",
    ],
    "admin_asset_views.py": [
        "_MAX_ASSET_BYTES",
        "_asset_invalid_response",
        "_validate_stored_asset_object",
        "AdminTenantAssetListCreateView",
        "AdminTenantAssetUploadView",
        "AdminTenantAssetDetailView",
    ],
    "admin_document_config_views.py": [
        "_template_rejected_response",
        "_guard_template_payload",
        "AdminTenantTemplateListCreateView",
        "AdminTenantTemplateDetailView",
        "_guard_profile_payload",
        "AdminTenantProfileListCreateView",
        "AdminTenantProfileDetailView",
        "AdminTenantProfileCloneView",
        "AdminTenantRequiredDocumentListCreateView",
        "AdminTenantRequiredDocumentDetailView",
    ],
    "admin_access_views.py": [
        "AdminMembershipListCreateView",
        "AdminMembershipDetailView",
        "AdminAccessGrantListCreateView",
        "AdminAccessGrantDetailView",
    ],
    "admin_routing_views.py": ["AdminRoutingSimulateView"],
    "admin_audit_views.py": ["AdminTenantAuditView", "AdminInstitutionAuditView"],
}

CATALOG_PLAN: dict[str, list[str]] = {
    "_catalog_view_helpers.py": [
        "ProgramListResponseSerializer",
        "ProgramResponseSerializer",
        "CanonicalProgramListResponseSerializer",
        "IntakeListResponseSerializer",
        "IntakeResponseSerializer",
        "SubjectListResponseSerializer",
        "InstitutionListResponseSerializer",
        "InstitutionResponseSerializer",
        "CatalogMessageResponseSerializer",
        "_request_method",
        "_is_admin",
        "_is_super_admin_request",
        "_visible_institution_queryset",
        "_scope_institution_queryset_for_request",
        "_scope_program_queryset_for_request",
        "_set_public_cache",
        "_CATALOG_CACHE_TTL",
        "_CATALOG_NEUTRAL_SCOPE",
        "_CANONICAL_PROGRAM_SELECTOR_ENDPOINT",
        "_ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT",
        "_CATALOG_EXPLICIT_SELECTOR_ENDPOINTS",
        "_catalog_scope_signature",
        "_cached_catalog_payload",
        "_INSTITUTION_WRITE_CAPABILITIES",
        "_INTAKE_WRITE_CAPABILITY",
        "_forbidden_response",
        "_INTAKE_FILTER_UNRESOLVED",
        "_resolve_intake_filter",
        "_resolve_request_context",
        "_request_host",
        "_is_local_shared_host",
        "_resolve_public_request_context",
    ],
    "context_views.py": ["CatalogContextView"],
    "program_views.py": [
        "ProgramListCreateView",
        "CanonicalProgramListView",
        "AssignmentPreviewView",
        "ProgramDetailView",
    ],
    "intake_views.py": ["IntakeListCreateView", "IntakeDetailView"],
    "subject_views.py": ["SubjectListView"],
    "institution_views.py": ["InstitutionListCreateView", "InstitutionDetailView"],
}


def _headers(plan_name: str) -> dict[str, str]:
    """Hand-written module headers + imports, keyed by target filename."""
    return HEADERS[plan_name]


HEADERS: dict[str, dict[str, str]] = {
    "admin": {
        "_admin_view_helpers.py": '''"""Shared helpers for the Beanola tenant-admin view modules.

Split out of ``apps/catalog/admin_views.py`` by admissions-v2 task 12.1 (finding
**MAINT-01**), following the shape ``apps/applications/`` already uses
(``_view_helpers.py`` + ``admin_*_views.py``). Every definition here is the one
that was in ``admin_views.py``, lifted verbatim by
``docs/v2-evidence/12.1/raw/backend-view-extract.py``.

What lives here is the **shared answer vocabulary** of that surface — the stable
409/403 envelopes, the one capability gate (``_write_allowed``), the one scope
resolution (``_scope_institution_ids`` / ``_readable_institution_queryset``), the
one pagination wrapper, and the two institution-child base views that implement
*scope before lookup* for every child resource. Keeping them in one module is the
point: a second copy of ``_write_allowed`` or of the child ``get_queryset`` is how
a tenant boundary drifts.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.catalog.canonical_config_commands import (
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
)
from apps.catalog.models import Institution
from apps.catalog.services import AccessScopeService, AdminCapabilityService
from apps.common.pagination import StandardPagination''',
        "admin_tenant_views.py": '''"""Tenant (institution) and tenant-offering admin views.

``/api/v1/admin/institutions/…`` — the tenant record itself, its launch
readiness, and its program offerings. Split out of ``admin_views.py`` by task
12.1; every view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _forbidden_write_response,
    _paginate,
    _readable_institution_queryset,
    _write_allowed,
)
from apps.catalog.admin_serializers import AdminInstitutionSerializer
from apps.catalog.canonical_config_commands import (
    apply_institution_profile_change,
    apply_program_offering_change,
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.models import Institution, Program
from apps.catalog.serializers import ProgramSerializer
from apps.catalog.tenant_readiness import build_tenant_readiness''',
        "admin_domain_views.py": '''"""Tenant domain lifecycle admin views.

``/api/v1/admin/institutions/<id>/domains/…`` — create, disable, activate, retry,
approve, reject and reactivate, all validated through the one
:class:`~apps.catalog.services.DomainStatusMachine`. Split out of
``admin_views.py`` by task 12.1; every view is the one that was there, lifted
verbatim.

The five lifecycle commands share one refusal vocabulary
(``DOMAIN_NOT_VERIFIED`` / ``DOMAIN_TRANSITION_REJECTED`` /
``HOSTNAME_CONFLICT``), which is why those response helpers stayed in
``_admin_view_helpers`` rather than moving here: the disable ``PATCH`` on the
detail view and the activate/reactivate integrity races use the same two codes.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _domain_not_verified_response,
    _domain_transition_conflict_response,
    _forbidden_write_response,
    _hostname_conflict_response,
    _write_allowed,
)
from apps.catalog.admin_serializers import AdminInstitutionDomainSerializer
from apps.catalog.canonical_config_commands import (
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
    create_institution_domain,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.models import InstitutionDomain
from apps.catalog.services import DomainStatusMachine, DomainTransitionError''',
        "admin_asset_views.py": '''"""Tenant branding-asset admin views.

``/api/v1/admin/institutions/<id>/assets/…`` — the multipart upload path (the
primary one, R13.3) and the manual storage-key registration path that validates
the **stored object's** bytes rather than the caller's metadata (R13.2). Split
out of ``admin_views.py`` by task 12.1; every view is the one that was there,
lifted verbatim.
"""

from __future__ import annotations

import hashlib
import os
import uuid

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _forbidden_write_response,
    _write_allowed,
)
from apps.catalog.admin_serializers import AdminInstitutionAssetSerializer
from apps.catalog.canonical_config_commands import audit_config_change as _audit_config_change
from apps.catalog.models import Institution, InstitutionAsset
from apps.catalog.tenant_audit_service import TenantAuditService''',
        "admin_document_config_views.py": '''"""Tenant document configuration admin views.

``/api/v1/admin/institutions/<id>/{templates,document-profiles,required-documents}/``
— the content-safety-validated document configuration surface, including the
clone endpoint that versions a profile by INSERT so documents already generated
from earlier versions keep their provenance (R8.5/R8.8). Split out of
``admin_views.py`` by task 12.1; every view is the one that was there, lifted
verbatim.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _forbidden_write_response,
    _integrity_conflict_response,
    _scope_institution_ids,
    _write_allowed,
)
from apps.catalog.admin_serializers import (
    AdminDocumentProfileSerializer,
    AdminDocumentTemplateSerializer,
    AdminRequiredDocumentSerializer,
)
from apps.catalog.canonical_config_commands import audit_config_change as _audit_config_change
from apps.catalog.models import (
    InstitutionDocumentProfile,
    InstitutionDocumentTemplate,
    InstitutionRequiredDocument,
)
from apps.catalog.services import (
    InstitutionDocumentProfileService,
    TemplateValidationError,
    validate_profile_payload,
    validate_template_payload,
)''',
        "admin_access_views.py": '''"""Tenant membership and access-grant admin views.

``/api/v1/admin/{memberships,access-grants}/…`` — the two surfaces that grant
tenant authority, and therefore the two that revoke in-flight sessions on every
successful write (R3.5). Unlike the institution-child surfaces these carry **no
institution path segment**: they are narrowed by the actor's own scope set before
the optional ``?institution=`` filter, so naming another tenant narrows to
nothing rather than widening to it. Split out of ``admin_views.py`` by task 12.1;
every view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.accounts.session_lifecycle import revoke_sessions_for_authority_change
from apps.catalog._admin_view_helpers import (
    _actor_id_str,
    _forbidden_write_response,
    _integrity_conflict_response,
    _paginate,
    _scope_institution_ids,
    _self_mutation_forbidden_response,
    _staff_invite_forbidden_response,
    _write_allowed,
)
from apps.catalog.admin_serializers import (
    AdminAccessGrantSerializer,
    AdminMembershipSerializer,
)
from apps.catalog.canonical_config_commands import (
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
)
from apps.catalog.models import AccessGrant, UserInstitutionMembership
from apps.catalog.services import AdminCapabilityService''',
        "admin_routing_views.py": '''"""Tenant routing-simulation admin view.

``POST /api/v1/admin/routing/simulate/`` — a dry run of the canonical
:class:`~apps.catalog.services.OfferingAssignmentService` that creates no
application row. Split out of ``admin_views.py`` by task 12.1; the view is the
one that was there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import _forbidden_write_response, _write_allowed
from apps.catalog.admin_serializers import AdminRoutingSimulationSerializer
from apps.catalog.models import CanonicalProgram, Intake, ProgramIntake
from apps.catalog.services import (
    InstitutionContextService,
    OfferingAssignmentError,
    OfferingAssignmentService,
)''',
        "admin_audit_views.py": '''"""Tenant observability / audit admin views (R13.2, R13.5, R6.6).

Two feeds, deliberately separate:

* ``GET /api/v1/admin/tenant-audit/`` — the **platform** operational-review feed
  spanning every school, gated by ``platform.audit.read_all``.
* ``GET /api/v1/admin/institutions/<id>/audit/`` — the **selected institution**
  feed: scoped before lookup, ``tenant.audit.read``-gated for that institution,
  filtered/paginated in SQL with server facets and a page-independent audited
  CSV export (task 9.5, finding ADM-05).

Split out of ``admin_views.py`` by task 12.1; both views are the ones that were
there, lifted verbatim.
"""

from __future__ import annotations

from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import (
    _forbidden_write_response,
    _paginate,
    _write_allowed,
)
from apps.catalog.admin_serializers import TenantAuditLogSerializer
from apps.catalog.tenant_audit_service import (
    OBSERVABILITY_CONFIG_PREFIX,
    OBSERVABILITY_ROUTING_FAILURE_ACTION,
    TenantAuditService,
)
from apps.common.models import AuditLog
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination

#: The capability the tenant audit export requires (task 9.5, R6.5/R6.6). Read
#: from the audit query authority so there is one declaration of it.
from apps.catalog.tenant_audit_query_service import (  # noqa: E402
    EXPORT_CAPABILITY as _TENANT_AUDIT_EXPORT_CAPABILITY,
)''',
    },
    "catalog": {
        "_catalog_view_helpers.py": '''"""Shared helpers for the ``/api/v1/catalog/`` view modules.

Split out of ``apps/catalog/views.py`` by admissions-v2 task 12.1 (finding
**MAINT-01**). Every definition here is the one that was in ``views.py``, lifted
verbatim by ``docs/v2-evidence/12.1/raw/backend-view-extract.py``.

Three concerns live here, and all three are shared by more than one endpoint:

* **the response envelopes** the OpenAPI schema registers by name, so a split
  cannot rename a schema component;
* **the read scope** — ``_is_admin`` / ``_scope_*_queryset_for_request`` /
  ``_resolve_public_request_context`` — the one place a white-label host narrows a
  public listing to its own tenant;
* **the read cache** — ``_catalog_scope_signature`` + ``_cached_catalog_payload``,
  whose scope-signature rule is the guard that a query parameter cannot create a
  cross-tenant cache key.
"""

from __future__ import annotations

import logging

from django.conf import settings
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import inline_serializer

from apps.accounts.permissions import is_super_admin
from apps.catalog.catalog_cache import CATALOG_NEUTRAL_SCOPE, catalog_institution_scope
from apps.catalog.models import Institution
from apps.catalog.serializers import (
    CanonicalProgramSerializer,
    InstitutionSerializer,
    IntakeSerializer,
    ProgramSerializer,
    SubjectSerializer,
)
from apps.catalog.services import (
    AdminCapabilityService,
    InstitutionContextService,
    OfferingDirectoryService,
)
from apps.common.openapi_helpers import (
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)
from apps.common.scoped_cache import build_scope_signature, cached_or_compute

logger = logging.getLogger(__name__)''',
        "context_views.py": '''"""The tenant-context catalog view.

``GET /api/v1/catalog/context/`` — resolve shared-Beanola vs white-label portal
context from the request host, through the fail-closed
:class:`~apps.catalog.services.InstitutionContextService`. Split out of
``views.py`` by task 12.1; the view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.catalog._catalog_view_helpers import (
    _resolve_request_context,
    _set_public_cache,
)''',
        "program_views.py": '''"""Program / offering catalog views.

``/api/v1/catalog/programs/``, ``/canonical-programs/`` and
``/assignment-preview/`` — the program-first student surface plus the frozen
legacy offering write path. Split out of ``views.py`` by task 12.1; every view is
the one that was there, lifted verbatim.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

from django.db.models import Prefetch
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin
from apps.catalog._catalog_view_helpers import (
    CanonicalProgramListResponseSerializer,
    CatalogMessageResponseSerializer,
    ProgramListResponseSerializer,
    ProgramResponseSerializer,
    _ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT,
    _CANONICAL_PROGRAM_SELECTOR_ENDPOINT,
    _INTAKE_FILTER_UNRESOLVED,
    _cached_catalog_payload,
    _forbidden_response,
    _is_admin,
    _request_host,
    _request_method,
    _resolve_intake_filter,
    _resolve_request_context,
    _scope_program_queryset_for_request,
    _set_public_cache,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.legacy_write_telemetry import (
    canonical_program_required_response,
    mark_deprecated,
    record_catalog_write,
)
from apps.catalog.models import CanonicalProgram, Intake, Program, ProgramIntake
from apps.catalog.permissions import TenantScopedCapabilityMixin
from apps.catalog.serializers import (
    CanonicalProgramSerializer,
    ProgramCreateUpdateSerializer,
    ProgramSerializer,
)
from apps.catalog.services import AdminCapabilityService, OfferingDirectoryService
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination

logger = logging.getLogger(__name__)''',
        "intake_views.py": '''"""Intake catalog views.

``/api/v1/catalog/intakes/`` — public intake listing plus the frozen legacy
intake write path. Intakes are **global**, so every write resolves the single
``platform.intake.manage`` capability (R5.3). Split out of ``views.py`` by task
12.1; both views are the ones that were there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin
from apps.catalog._catalog_view_helpers import (
    CatalogMessageResponseSerializer,
    IntakeListResponseSerializer,
    IntakeResponseSerializer,
    _INTAKE_WRITE_CAPABILITY,
    _cached_catalog_payload,
    _is_admin,
    _request_method,
    _set_public_cache,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.legacy_write_telemetry import mark_deprecated, record_catalog_write
from apps.catalog.models import Intake
from apps.catalog.permissions import HasPlatformCapability
from apps.catalog.serializers import IntakeSerializer
from apps.common.openapi_helpers import ErrorResponseSerializer''',
        "subject_views.py": '''"""The subject catalog view.

``GET /api/v1/catalog/subjects/`` — the **only** source of selectable subject
identities (R11.5, finding STU-11), serving active canonical rows plus the
versioned alias catalogue (R11.4). Split out of ``views.py`` by task 12.1; the
view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.catalog._catalog_view_helpers import (
    SubjectListResponseSerializer,
    _cached_catalog_payload,
    _set_public_cache,
)
from apps.catalog.models import Subject
from apps.catalog.serializers import SubjectSerializer
from apps.catalog.subject_catalog import (
    SUBJECT_CATALOG_VERSION,
    active_subjects_queryset,
    aliases_by_code,
)''',
        "institution_views.py": '''"""Institution catalog views.

``/api/v1/catalog/institutions/`` — the public institution listing plus the
frozen legacy tenant write path, capability-gated per method (R5.1) with the
public ``GET`` behaviour preserved (R5.5). Split out of ``views.py`` by task
12.1; both views are the ones that were there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin
from apps.catalog._catalog_view_helpers import (
    CatalogMessageResponseSerializer,
    InstitutionListResponseSerializer,
    InstitutionResponseSerializer,
    _INSTITUTION_WRITE_CAPABILITIES,
    _is_admin,
    _request_method,
    _scope_institution_queryset_for_request,
    _set_public_cache,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.legacy_write_telemetry import mark_deprecated, record_catalog_write
from apps.catalog.models import Institution, Program
from apps.catalog.permissions import HasPlatformCapability, TenantScopedCapabilityMixin
from apps.catalog.serializers import InstitutionSerializer
from apps.common.openapi_helpers import ErrorResponseSerializer''',
    },
}


def run(plan_name: str) -> None:
    source_name = "admin_views.py" if plan_name == "admin" else "views.py"
    source = CATALOG / f"_{plan_name}_source.py"
    if not source.exists():
        source = CATALOG / source_name
    plan = ADMIN_PLAN if plan_name == "admin" else CATALOG_PLAN
    spans = top_level_spans(source)
    missing = [name for names in plan.values() for name in names if name not in spans]
    assert not missing, f"not top-level in {source.name}: {missing}"
    print(f"{source.name}: {len(spans)} top-level definitions, plan covers {sum(len(v) for v in plan.values())}")
    headers = _headers(plan_name)
    for target_name, names in plan.items():
        write_module(
            source=source,
            target=CATALOG / target_name,
            header=headers[target_name],
            names=names,
            spans=spans,
        )


def verify() -> None:
    """Re-assert byte-identity of every moved definition against the pre-split copy."""
    for plan_name, plan in (("admin", ADMIN_PLAN), ("catalog", CATALOG_PLAN)):
        source = CATALOG / f"_{plan_name}_source.py"
        if not source.exists():
            print(f"{plan_name}: no pre-split copy retained; skipping")
            continue
        spans = top_level_spans(source)
        for target_name, names in plan.items():
            written = (CATALOG / target_name).read_text()
            for name, text in render(source, spans, names):
                assert text in written, f"{name} drifted in {target_name}"
        print(f"{plan_name}: every moved definition still byte-identical")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, choices=["admin", "catalog", "verify"])
    args = parser.parse_args()
    if args.plan == "verify":
        verify()
    else:
        run(args.plan)
    return 0


if __name__ == "__main__":
    sys.exit(main())
