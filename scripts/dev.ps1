# Bancada — dev no Windows (máquina principal de trabalho).
# Requer: Node 20+, pnpm, Rust (rustup), WebView2 e Build Tools do VS.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path "node_modules")) { pnpm install }

# O Tauri sobe o vite sozinho via beforeDevCommand — não duplicar aqui.
pnpm tauri dev
