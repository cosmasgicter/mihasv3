"""Outreach URL routes."""

from django.urls import path

from apps.outreach.views import (
    OutreachCampaignListCreateView,
    OutreachContactEnrichView,
    OutreachContactListCreateView,
    OutreachMessageGenerateView,
    OutreachMessageSendView,
)

app_name = "outreach"

urlpatterns = [
    path("contacts/", OutreachContactListCreateView.as_view(), name="contact-list-create"),
    path("contacts/enrich/", OutreachContactEnrichView.as_view(), name="contact-enrich"),
    path("campaigns/", OutreachCampaignListCreateView.as_view(), name="campaign-list-create"),
    path("messages/generate/", OutreachMessageGenerateView.as_view(), name="message-generate"),
    path("messages/send/", OutreachMessageSendView.as_view(), name="message-send"),
]

