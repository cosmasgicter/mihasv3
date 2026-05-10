"""Legacy DRF throttle classes for payment endpoints.

These ``UserRateThrottle`` subclasses were the pre-payment-hardening
rate-limit surface. Phase 5 replaces their use on payment views with
``apps.common.throttling.PaymentUserScopedRateThrottle`` + flag gating.

They are retained here (and their imports are preserved elsewhere) so
non-hardening rollback is a pure settings-flag flip. Do not remove.
"""

from rest_framework.throttling import UserRateThrottle


# LEGACY: PaymentVerifyThrottle retained for non-hardening rollback
class PaymentVerifyThrottle(UserRateThrottle):
    scope = "payment_verify"
    rate = "10/min"


# LEGACY: PaymentInitiateThrottle retained for non-hardening rollback
class PaymentInitiateThrottle(UserRateThrottle):
    scope = "payment_initiate"
    rate = "5/min"


# LEGACY: MobileMoneyThrottle retained for non-hardening rollback
class MobileMoneyThrottle(UserRateThrottle):
    scope = "mobile_money_initiate"
    rate = "5/min"
