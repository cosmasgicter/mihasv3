"""Catalog views — re-export shim.

Decomposed by admissions-v2 task **12.1** (finding **MAINT-01**) from one
1,570-line module into resource-scoped view modules, matching the shape this app
already uses for its admin surfaces (``admin_intake_views.py``,
``admin_program_intake_views.py``, ``staff_invitation_views.py``, …). Nothing was
re-authored: every definition was lifted by line span with byte-identity asserted
before the new file was written
(``docs/v2-evidence/12.1/raw/backend-view-extract.py``).

Split modules:
  - ``_catalog_view_helpers.py`` - the named OpenAPI response envelopes, the read
                                   scope resolution, and the tenant-scoped read
                                   cache (signature + payload wrapper)
  - ``context_views.py``         - ``/catalog/context/``
  - ``program_views.py``         - ``/catalog/programs/``,
                                   ``/canonical-programs/``,
                                   ``/assignment-preview/``
  - ``intake_views.py``          - ``/catalog/intakes/``
  - ``subject_views.py``         - ``/catalog/subjects/``
  - ``institution_views.py``     - ``/catalog/institutions/``

Compatibility owner: Beanola platform engineering.
Removal condition: ``apps/catalog/urls.py`` imports the canonical split modules
directly and no test patches ``apps.catalog.views.*``. Several suites patch
``apps.catalog.views.{Program,Intake,Subject,Institution}.objects`` and
``apps.catalog.views.StandardPagination.paginate_queryset``, which resolve
through the explicit re-exports below.
"""

from apps.catalog._catalog_view_helpers import *  # noqa: F401,F403
from apps.catalog.context_views import *  # noqa: F401,F403
from apps.catalog.program_views import *  # noqa: F401,F403
from apps.catalog.intake_views import *  # noqa: F401,F403
from apps.catalog.subject_views import *  # noqa: F401,F403
from apps.catalog.institution_views import *  # noqa: F401,F403

# Underscore-prefixed names are excluded from wildcard imports. Re-export the
# shared read-scope, cache and refusal helpers explicitly.
from apps.catalog._catalog_view_helpers import (  # noqa: F401
    _ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT,
    _CANONICAL_PROGRAM_SELECTOR_ENDPOINT,
    _CATALOG_CACHE_TTL,
    _CATALOG_EXPLICIT_SELECTOR_ENDPOINTS,
    _CATALOG_NEUTRAL_SCOPE,
    _INSTITUTION_WRITE_CAPABILITIES,
    _INTAKE_FILTER_UNRESOLVED,
    _INTAKE_WRITE_CAPABILITY,
    _cached_catalog_payload,
    _catalog_scope_signature,
    _forbidden_response,
    _is_admin,
    _is_local_shared_host,
    _is_super_admin_request,
    _request_host,
    _request_method,
    _resolve_intake_filter,
    _resolve_public_request_context,
    _resolve_request_context,
    _scope_institution_queryset_for_request,
    _scope_program_queryset_for_request,
    _set_public_cache,
    _visible_institution_queryset,
)

# Test patch backward-compat: suites use
# ``@patch("apps.catalog.views.Program.objects")`` (and the same for Intake /
# Subject / Institution) plus
# ``@patch("apps.catalog.views.StandardPagination.paginate_queryset")``. Those
# names must keep resolving through this module.
from apps.catalog.models import (  # noqa: F401
    CanonicalProgram,
    Institution,
    Intake,
    Program,
    ProgramIntake,
    Subject,
)
from apps.common.pagination import StandardPagination  # noqa: F401

COMPATIBILITY_OWNER = "Beanola platform engineering"
REMOVAL_CONDITION = (
    "Remove after apps/catalog/urls.py imports the canonical split modules "
    "directly and no test patches apps.catalog.views.*"
)
