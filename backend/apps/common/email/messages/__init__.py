"""Per-message email template modules.

Each module defines a single function that takes a context dict and returns
a ``(subject, html_body)`` tuple, ready to pass through the shell in render.py.

Message modules should:
   - be pure — no database I/O
   - escape all user-supplied strings
   - prefer the component helpers over raw HTML
   - keep copy warm but institutional — this is a real school, not a SaaS
"""
