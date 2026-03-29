"""Custom exception handler — stub for project scaffold.

Full implementation in task 6.2.
"""

from rest_framework.views import exception_handler


def envelope_exception_handler(exc, context):
    """Map DRF exceptions to the envelope error format.

    Stub — delegates to default DRF handler until fully implemented.
    """
    return exception_handler(exc, context)
