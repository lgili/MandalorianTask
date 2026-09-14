# Bancada — dev on Windows (the main work machine).
# Requires: Node 20+, pnpm, Rust (rustup), WebView2 and the VS Build Tools.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path "node_modules")) { pnpm install }

# Tauri starts vite on its own via beforeDevCommand — don't duplicate it here.
pnpm tauri dev
