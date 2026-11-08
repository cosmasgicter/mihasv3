"""Prove object storage works end to end: write, read, sign, fetch, delete.

Prints one line per step and a final ``OK`` or ``FAILED``. It never prints
keys, URLs, bucket names or credentials. Exit code 0 on success, 1 otherwise.
"""
from __future__ import annotations

import logging
import os
import uuid

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError

from apps.common.storage import MediaStorage, _get_presigned_object_key, get_s3_client

logger = logging.getLogger(__name__)
_HTTP_TIMEOUT_SECONDS = 15


class Command(BaseCommand):
    help = "Write, read, sign, fetch and delete one object to verify object storage."

    def add_arguments(self, parser):
        parser.add_argument(
            "--expect-private",
            action="store_true",
            help="Also GET the unsigned object URL and require 403.",
        )

    def _step(self, name: str, ok: bool, failures: list[str]) -> None:
        if ok:
            self.stdout.write(f"PASS {name}")
        else:
            failures.append(name)
            self.stdout.write(f"FAILED {name}")
            logger.error("storage_roundtrip_check step failed: %s", name)

    def handle(self, *args, **options):
        storage = MediaStorage()
        payload = os.urandom(32)
        name = f"healthchecks/{uuid.uuid4()}.txt"
        failures: list[str] = []
        stored: str | None = None
        url = ""

        try:
            stored = storage.save(name, ContentFile(payload))
            self._step("write", True, failures)
        except Exception:  # noqa: BLE001 - report the step, never the detail
            self._step("write", False, failures)

        if stored:
            try:
                with storage.open(stored) as handle:
                    self._step("read", handle.read() == payload, failures)
            except Exception:  # noqa: BLE001
                self._step("read", False, failures)

            try:
                # Signed with the internal client so the backend can fetch it itself.
                url = get_s3_client().generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                        "Key": _get_presigned_object_key(stored),
                    },
                    ExpiresIn=60,
                )
                response = requests.get(url, timeout=_HTTP_TIMEOUT_SECONDS)
                self._step(
                    "sign_and_fetch",
                    response.status_code == 200 and response.content == payload,
                    failures,
                )
            except Exception:  # noqa: BLE001
                self._step("sign_and_fetch", False, failures)

            if options["expect_private"]:
                try:
                    bare = url.split("?", 1)[0]
                    private = requests.get(bare, timeout=_HTTP_TIMEOUT_SECONDS).status_code == 403
                    self._step("unsigned_denied", private, failures)
                except Exception:  # noqa: BLE001
                    self._step("unsigned_denied", False, failures)

            try:
                storage.delete(stored)
                self._step("delete", not storage.exists(stored), failures)
            except Exception:  # noqa: BLE001
                self._step("delete", False, failures)

        if failures:
            self.stdout.write("FAILED")
            raise CommandError("storage round-trip failed")
        self.stdout.write("OK")
