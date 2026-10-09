"""Admin management APIs for Beanola tenant onboarding — re-export shim.

Decomposed by admissions-v2 task **12.1** (finding **MAINT-01**) from one
2,072-line module into domain-scoped view modules, following the shape
``apps/applications/`` already uses (``views.py`` shim + ``admin_*_views.py`` +
``_view_helpers.py``). Nothing was re-authored: every definition was lifted by
line span with byte-identity asserted before the new file was written
(``docs/v2-evidence/12.1/raw/backend-view-extract.py``).

Split modules:
  - ``_admin_view_helpers.py``          - the shared 403/404/409 vocabulary, the
                                         one capability gate, the one scope
                                         resolution, and the two
                                         institution-child base views that apply
                                         *scope before lookup*
  - ``admin_tenant_views.py``           - the institution record, its launch
                                         readiness, and its offerings
  - ``admin_domain_views.py``           - the seven domain lifecycle commands
  - ``admin_asset_views.py``            - branding-asset upload + registration
  - ``admin_document_config_views.py``  - templates, document profiles (incl.
                                         clone/version), required documents
  - ``admin_access_views.py``           - memberships + access grants
  - ``admin_routing_views.py``          - the routing simulator
  - ``admin_audit_views.py``            - the platform + per-institution audit
                                         feeds

Compatibility owner: Beanola platform engineering.
Removal condition: no first-party module imports ``apps.catalog.admin_views``
(``admin_urls.py`` and ``staff_invitation_views.py`` are the two that still do)
and no test imports or patches it. Until then this shim is the stable name.
"""

from apps.catalog._admin_view_helpers import *  # noqa: F401,F403
from apps.catalog.admin_tenant_views import *  # noqa: F401,F403
from apps.catalog.admin_domain_views import *  # noqa: F401,F403
from apps.catalog.admin_asset_views import *  # noqa: F401,F403
from apps.catalog.admin_document_config_views import *  # noqa: F401,F403
from apps.catalog.admin_access_views import *  # noqa: F401,F403
from apps.catalog.admin_routing_views import *  # noqa: F401,F403
from apps.catalog.admin_audit_views import *  # noqa: F401,F403

# Underscore-prefixed names are excluded from wildcard imports, so re-export the
# ones first-party callers and tests reference explicitly.
# ``apps/catalog/staff_invitation_views.py`` imports ``_audit_config_change`` and
# ``_scope_institution_ids`` from here; the rest are the shared response
# vocabulary and payload guards other modules in this app reach for.
from apps.catalog._admin_view_helpers import (  # noqa: F401
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _actor_id_str,
    _audit_config_change,
    _domain_not_verified_response,
    _domain_transition_conflict_response,
    _forbidden_write_response,
    _hostname_conflict_response,
    _integrity_conflict_response,
    _paginate,
    _readable_institution_queryset,
    _scope_institution_ids,
    _self_mutation_forbidden_response,
    _staff_invite_forbidden_response,
    _verb_for_payload,
    _write_allowed,
    _write_capability_for_resource,
)
from apps.catalog._admin_view_helpers import (  # noqa: F401
    _WRITE_CAPABILITY_BY_RESOURCE,
)
from apps.catalog.admin_asset_views import (  # noqa: F401
    _MAX_ASSET_BYTES,
    _asset_invalid_response,
    _validate_stored_asset_object,
)
from apps.catalog.admin_document_config_views import (  # noqa: F401
    _guard_profile_payload,
    _guard_template_payload,
    _template_rejected_response,
)
from apps.catalog.admin_domain_views import _get_domain_or_404  # noqa: F401
from apps.catalog.admin_audit_views import (  # noqa: F401
    _TENANT_AUDIT_EXPORT_CAPABILITY,
)

# Re-exported for backwards compatibility with callers that imported the tenant
# readiness helpers through this module.
from apps.catalog.tenant_readiness import (  # noqa: F401
    _readiness_item,
    build_tenant_readiness,
)

COMPATIBILITY_OWNER = "Beanola platform engineering"
REMOVAL_CONDITION = (
    "Remove after apps/catalog/admin_urls.py and staff_invitation_views.py import "
    "the canonical split modules directly and no test patches "
    "apps.catalog.admin_views.*"
)
