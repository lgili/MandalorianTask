#!/usr/bin/env bash
# Bancada — dev on macOS/Linux.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d node_modules ] || pnpm install

# Tauri starts vite via beforeDevCommand.
pnpm tauri dev
