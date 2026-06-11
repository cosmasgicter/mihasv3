"""Tenant-aware official-document renderer package (R8.3).

Spec: multi-tenant-beanola-remediation Phase 4 (R8.3). This package is the
structured renderer layer the Official_Document_Generator
(``pdf_generation._render_official_pdf``) delegates to. Content for each
document type is built from the resolved ``InstitutionDocumentProfile`` + tenant
assets — never from frontend constants.

Layout:
    render_context.py            tenant + resolved profile + assets + payment
    renderers/{application_slip,acceptance_letter,conditional_offer,payment_receipt}.py
    layouts/{simple_letter,fee_chart_letter}.py
"""

from .render_context import RenderContext, build_render_context
from .renderers import render_official_document

__all__ = ["RenderContext", "build_render_context", "render_official_document"]
