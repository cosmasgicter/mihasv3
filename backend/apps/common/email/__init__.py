"""Beanola email component system.

A small, opinionated framework for building transactional emails that match
the PDF document design language. Import tokens, components, and the shell
through this package.

Usage::

    from apps.common.email import shell, components, tokens
    from apps.common.email.render import render_message

    subject, html, text = render_message("application_submitted", context)
"""

from apps.common.email import components, shell, tokens

__all__ = ["components", "shell", "tokens"]
