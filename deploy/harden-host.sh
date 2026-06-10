#!/usr/bin/env bash
# One-shot host hardening for the MIHAS EC2 box (run once, idempotent).
# See RUNBOOK §9. Safe to re-run.
set -euo pipefail

echo "==> 1/3  Docker log rotation (stops unbounded logs filling the disk)"
sudo install -m 0644 "$(dirname "$0")/daemon.json" /etc/docker/daemon.json
sudo systemctl restart docker
# Note: containers pick up the new limit on their next (re)create, not restart.

echo "==> 2/3  Unattended security upgrades"
sudo apt-get update -y
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> 3/3  fail2ban (SSH brute-force protection)"
sudo apt-get install -y fail2ban
sudo systemctl enable --now fail2ban

echo "==> done. Verify:"
echo "    docker info --format '{{.LoggingDriver}}'   # json-file"
echo "    sudo systemctl status fail2ban --no-pager"
echo "    systemctl status unattended-upgrades --no-pager"
