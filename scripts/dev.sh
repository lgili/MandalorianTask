#!/usr/bin/env bash
# Bancada — dev no macOS/Linux.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d node_modules ] || pnpm install

# O Tauri sobe o vite via beforeDevCommand.
pnpm tauri dev
