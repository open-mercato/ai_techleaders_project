$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Push-Location $RepoRoot
try {
    & npm.cmd run test:integration
    if ($LASTEXITCODE -ne 0) {
        throw "Integration tests failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
