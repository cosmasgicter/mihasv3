"""Deprecated - shim module.

The email shell has moved to ``apps.common.email.shell``. This module is
preserved for one release so existing callers don't break while we update
them. It will be removed in Task 11 of the PDF/email redesign migration.

New code should import from the package directly::

    from apps.common.email.shell import render_shell
    from apps.common.email import components
"""

from apps.common.email.shell import get_base_email_html, render_shell

__all__ = ["get_base_email_html", "render_shell"]
