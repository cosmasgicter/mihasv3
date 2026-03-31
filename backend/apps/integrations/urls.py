"""Integrations URL routes."""

from django.urls import path

from apps.integrations.views import OpenAITestView, TelegramConnectView, TelegramTestView, TelegramWebhookView

app_name = "integrations"

urlpatterns = [
    path("telegram/connect/", TelegramConnectView.as_view(), name="telegram-connect"),
    path("telegram/test/", TelegramTestView.as_view(), name="telegram-test"),
    path("telegram/webhook/", TelegramWebhookView.as_view(), name="telegram-webhook"),
    path("openai/test/", OpenAITestView.as_view(), name="openai-test"),
]

