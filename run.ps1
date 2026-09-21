$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20+ is required." }
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path node_modules)) { npm install; if ($LASTEXITCODE -ne 0) { throw "npm install failed" } }
npm run dev
