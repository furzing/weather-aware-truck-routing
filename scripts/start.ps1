param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Create the virtual environment and install requirements-dev.txt first (see README).' }
Push-Location $projectRoot
try {
    & npm.cmd --prefix frontend run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    & $pythonPath backend\manage.py collectstatic --noinput
    if ($LASTEXITCODE -ne 0) { throw 'Static asset collection failed.' }
    Push-Location (Join-Path $projectRoot 'backend')
    try {
        Write-Host "Open http://127.0.0.1:$Port (Ctrl+C to stop)."
        & $pythonPath -m waitress "--listen=127.0.0.1:$Port" --threads=6 config.wsgi:application
    } finally { Pop-Location }
} finally { Pop-Location }
