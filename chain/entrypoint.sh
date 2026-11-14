#!/usr/bin/env bash
# Container entrypoint: start or restart the local network, then stay alive while
# the avalanchego processes (started detached by tmpnet) keep running.
set -euo pipefail

rm -f /data/ready
sealed-localnet
touch /data/ready
echo "network up; following node logs"
exec tail -F /data/networks/*/*/logs/main.log 2>/dev/null
