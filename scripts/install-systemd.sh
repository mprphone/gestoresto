#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="gestoresto-api.service"
PROJECT_DIR="/home/ubuntu/programas/gestoresto"

sudo cp "$PROJECT_DIR/deploy/systemd/$SERVICE_NAME" "/etc/systemd/system/$SERVICE_NAME"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager
