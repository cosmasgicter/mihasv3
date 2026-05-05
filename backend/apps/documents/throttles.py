from rest_framework.throttling import UserRateThrottle


class PaymentInitiateThrottle(UserRateThrottle):
    scope = "payment_initiate"
    rate = "5/min"


class PaymentVerifyThrottle(UserRateThrottle):
    scope = "payment_verify"
    rate = "10/min"


class MobileMoneyThrottle(UserRateThrottle):
    scope = "mobile_money_initiate"
    rate = "5/min"
