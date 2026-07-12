<#
.SYNOPSIS
    Deploys the PhotoSheet-Maker web app (Vite build) to the Static Web App
    provisioned by Deploy-Infrastructure-v1.ps1.

.DESCRIPTION
    Invokes StaticSitesClient.exe directly, bypassing the SWA CLI wrapper
    that fails its remote-metadata check on restricted corporate networks
    (same workaround as C:\repos\navyaskitchen\deploy_functions.ps1).

    Pipeline:
      1. Verify Azure CLI is logged in.
      2. Verify the target SWA exists.
      3. Fetch the SWA deployment token.
      4. Build the workspace:
           pnpm install
           pnpm --filter @photosheet/shared build   (compiles packages/shared)
           pnpm --filter @photosheet/web    build   (produces apps/web/dist/)
      5. Deploy apps/web/dist/ as the SWA static content.

    Notes on shape vs the Navya's Kitchen script:
      * No `api/` folder is bundled with this SWA. PhotoSheet-Maker's Azure
        Functions API is a LINKED BYO backend (spec §3), attached in
        Deploy-Infrastructure-v1.ps1 Phase 7. So API_LOCATION is empty here.
      * No staging directory is needed. Vite's `apps/web/dist/` is already
        the minimum-viable deploy artifact - node_modules and source are
        excluded by design.
      * SKIP_APP_BUILD=true because we've already built with pnpm; the
        binary just uploads the artifacts.

.PARAMETER Environment
    Target environment: DEV or PRD. Determines the resource group and
    SWA name via the same $AppSlug convention as Deploy-Infrastructure-v1.

.PARAMETER Force
    Skip the interactive PRD confirmation prompt (for CI use).

.PARAMETER SkipBuild
    Skip pnpm install + build. Use in CI when the build step ran earlier
    in the workflow. Fails fast if apps/web/dist/ is missing.

.PARAMETER SwaEnvironmentName
    SWA deployment environment. Defaults to 'production' (the default
    hostname). Pass any other value to publish to a named staging slot
    (e.g. 'preview-2026-07-12') that surfaces on its own URL.

.EXAMPLE
    ./infra/Deploy-App-v1.ps1 -Environment DEV

.EXAMPLE
    ./infra/Deploy-App-v1.ps1 -Environment PRD -Force

.EXAMPLE
    # CI: build already ran in a previous step
    ./infra/Deploy-App-v1.ps1 -Environment DEV -SkipBuild

.NOTES
    Prerequisites:
      - Node.js 22+ and pnpm 9+ on PATH
      - Azure CLI (az) on PATH, already logged in via `az login` or
        Azure-Connectivity.ps1
      - StaticSitesClient.exe cached under ~/.swa/deploy/ - this is
        populated automatically the first time you run `swa deploy` from
        `@azure/static-web-apps-cli`. The script prints the exact bootstrap
        command if the binary is missing.
      - Deploy-Infrastructure-v1.ps1 must have already provisioned the
        target SWA in the resource group named below.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('DEV', 'PRD')]
    [string]$Environment = 'DEV',

    [switch]$Force,

    [switch]$SkipBuild,

    [Parameter()]
    [string]$SwaEnvironmentName = 'production'
)

$ErrorActionPreference = 'Stop'

# ── Configuration (mirrors Deploy-Infrastructure-v1.ps1) ────────────
$AppSlug = 'photosheetmakerv1'

$config = @{
    DEV = @{
        ResourceGroup = "rg-$AppSlug-dev"
        SwaName       = "swa-$AppSlug-dev"
    }
    PRD = @{
        ResourceGroup = "rg-$AppSlug-prd"
        SwaName       = "swa-$AppSlug-prd"
    }
}
$envCfg = $config[$Environment]

# Repo root sits one directory above this script (infra/).
$RepoRoot = Split-Path -Parent $PSScriptRoot
$WebDist  = Join-Path $RepoRoot 'apps\web\dist'

# ── Resolve StaticSitesClient.exe ─────────────────────────────────────
# The SWA CLI caches this binary under ~/.swa/deploy/ after its first run.
# Metadata JSON records the absolute path; fall back to a recursive search.
$StaticSitesClientMetadata = "$env:USERPROFILE\.swa\deploy\StaticSitesClient.json"
if (Test-Path $StaticSitesClientMetadata) {
    $StaticSitesClientPath = (Get-Content $StaticSitesClientMetadata -Raw | ConvertFrom-Json).binary
} else {
    $found = Get-ChildItem "$env:USERPROFILE\.swa\deploy" -Recurse -Filter 'StaticSitesClient.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $StaticSitesClientPath = if ($found) { $found.FullName } else { $null }
}

Write-Host ''
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host "  PhotoSheet-Maker - SWA Deployment ($Environment)" -ForegroundColor Cyan
Write-Host '======================================================' -ForegroundColor Cyan

# ── PRD confirmation gate ────────────────────────────────────────────
if ($Environment -eq 'PRD') {
    Write-Host ''
    Write-Host '  ⚠  You are about to deploy to PRODUCTION.' -ForegroundColor Red
    if ($Force) {
        Write-Host '  -Force supplied - skipping interactive confirmation.' -ForegroundColor Yellow
    } else {
        $confirm = Read-Host "  Type 'yes' to continue"
        if ($confirm -ne 'yes') {
            Write-Host '  Aborted by operator.' -ForegroundColor Yellow
            exit 0
        }
    }
}

# ── 1. Azure CLI Login Check ──────────────────────────────────────────
Write-Host ''
Write-Host '[1/5] Checking Azure CLI login...' -ForegroundColor Yellow
$account = az account show --query name -o tsv 2>$null
if (-not $account) {
    Write-Host '  ERROR: Not logged in. Run one of:' -ForegroundColor Red
    Write-Host '    az login' -ForegroundColor White
    Write-Host '    ./infra/Azure-Connectivity.ps1' -ForegroundColor White
    exit 1
}
Write-Host "  Logged in: $account" -ForegroundColor Green

# ── 2. Verify SWA exists ──────────────────────────────────────────────
Write-Host ''
Write-Host "[2/5] Verifying Static Web App '$($envCfg.SwaName)'..." -ForegroundColor Yellow
$swaHostname = az staticwebapp show `
    --name $envCfg.SwaName `
    --resource-group $envCfg.ResourceGroup `
    --query defaultHostname -o tsv 2>$null

if (-not $swaHostname) {
    Write-Host "  ERROR: Static Web App '$($envCfg.SwaName)' not found in '$($envCfg.ResourceGroup)'." -ForegroundColor Red
    Write-Host '         Run ./infra/Deploy-Infrastructure-v1.ps1 first to provision it.' -ForegroundColor Red
    exit 1
}
Write-Host "  Found: https://$swaHostname" -ForegroundColor Green

# ── 3. Fetch Deployment Token ─────────────────────────────────────────
Write-Host ''
Write-Host '[3/5] Fetching deployment token...' -ForegroundColor Yellow
$DeploymentToken = az staticwebapp secrets list `
    --name $envCfg.SwaName `
    --resource-group $envCfg.ResourceGroup `
    --query 'properties.apiKey' -o tsv 2>$null

if (-not $DeploymentToken) {
    Write-Host '  ERROR: Could not retrieve deployment token.' -ForegroundColor Red
    Write-Host '         Verify the deployer SP has the "Contributor" role on the SWA resource.' -ForegroundColor Red
    exit 1
}
Write-Host "  Token retrieved ($($DeploymentToken.Length) chars)." -ForegroundColor Green

# ── 4. Build the web app ──────────────────────────────────────────────
Write-Host ''
Write-Host '[4/5] Building web app (Vite + pnpm workspace)...' -ForegroundColor Yellow

if ($SkipBuild) {
    Write-Host '  -SkipBuild supplied - skipping pnpm install/build.' -ForegroundColor DarkGray
    if (-not (Test-Path $WebDist)) {
        Write-Host "  ERROR: -SkipBuild set but $WebDist does not exist." -ForegroundColor Red
        Write-Host '         Remove -SkipBuild or run the build before invoking this script.' -ForegroundColor Red
        exit 1
    }
} else {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Host '  ERROR: pnpm not on PATH. Install with:  npm install -g pnpm@9' -ForegroundColor Red
        exit 1
    }

    Push-Location $RepoRoot
    try {
        Write-Host '  → pnpm install' -ForegroundColor Gray
        pnpm install 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed (exit $LASTEXITCODE)" }

        Write-Host '  → pnpm --filter @photosheet/shared build' -ForegroundColor Gray
        pnpm --filter '@photosheet/shared' build 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "packages/shared build failed (exit $LASTEXITCODE)" }

        Write-Host '  → pnpm --filter @photosheet/web build' -ForegroundColor Gray
        pnpm --filter '@photosheet/web' build 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "apps/web build failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $WebDist)) {
        Write-Host "  ERROR: Vite build finished but $WebDist is missing. Check vite.config.ts outDir." -ForegroundColor Red
        exit 1
    }
    $distSize = (Get-ChildItem $WebDist -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $distFiles = (Get-ChildItem $WebDist -Recurse -File).Count
    Write-Host "  Build complete - $distFiles files, $([Math]::Round($distSize/1MB, 2)) MB." -ForegroundColor Green
}

# ── 5. Deploy via StaticSitesClient ───────────────────────────────────
Write-Host ''
Write-Host '[5/5] Deploying to Azure Static Web Apps...' -ForegroundColor Yellow

if (-not $StaticSitesClientPath -or -not (Test-Path $StaticSitesClientPath)) {
    Write-Host '  StaticSitesClient.exe not found in the SWA CLI cache.' -ForegroundColor Red
    Write-Host ''
    Write-Host '  One-time bootstrap - primes the cache with the binary:' -ForegroundColor Yellow
    Write-Host '    npm install -g @azure/static-web-apps-cli@latest' -ForegroundColor White
    Write-Host '    swa deploy apps/web/dist --deployment-token <any-token> --env production' -ForegroundColor White
    Write-Host '  Cancel that command as soon as it reports "Downloading StaticSitesClient" -' -ForegroundColor Gray
    Write-Host '  the binary is now cached and this script will find it on the next run.' -ForegroundColor Gray
    exit 1
}
Write-Host "  Using: $StaticSitesClientPath" -ForegroundColor Gray

# StaticSitesClient reads its configuration from environment variables.
# The child process inherits them; we clear them on exit so subsequent
# invocations in the same shell don't reuse stale values.
$env:DEPLOYMENT_ACTION         = 'upload'
$env:DEPLOYMENT_PROVIDER       = 'SwaCli'
$env:REPOSITORY_BASE           = $RepoRoot
$env:APP_LOCATION              = 'apps/web/dist'   # Vite build output
$env:API_LOCATION              = ''                # linked backend, not bundled
$env:OUTPUT_LOCATION           = ''                # already built; APP_LOCATION IS the output
$env:SKIP_APP_BUILD            = 'true'
$env:SKIP_API_BUILD            = 'true'
$env:DEPLOYMENT_TOKEN          = $DeploymentToken
$env:VERBOSE                   = 'true'
if ($SwaEnvironmentName -ne 'production') {
    $env:DEPLOYMENT_ENVIRONMENT = $SwaEnvironmentName
}

# StaticSitesClient requires its CWD != APP_LOCATION. Push to TEMP.
Push-Location $env:TEMP
try {
    & $StaticSitesClientPath
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:DEPLOYMENT_TOKEN, Env:DEPLOYMENT_ACTION, Env:DEPLOYMENT_PROVIDER,
        Env:REPOSITORY_BASE, Env:APP_LOCATION, Env:API_LOCATION, Env:OUTPUT_LOCATION,
        Env:SKIP_APP_BUILD, Env:SKIP_API_BUILD, Env:VERBOSE `
        -ErrorAction SilentlyContinue
    if ($SwaEnvironmentName -ne 'production') {
        Remove-Item Env:DEPLOYMENT_ENVIRONMENT -ErrorAction SilentlyContinue
    }
}

# ── Result ────────────────────────────────────────────────────────────
Write-Host ''
if ($exitCode -eq 0) {
    $liveUrl = if ($SwaEnvironmentName -eq 'production') {
        "https://$swaHostname"
    } else {
        # Named environments get their own hostname of the shape
        # <default-hostname-without-region>-<env-name>.<region>.azurestaticapps.net.
        # The binary prints the exact URL in verbose output - safer to
        # let the operator read it from the log than to guess.
        "(named environment '$SwaEnvironmentName' - see 'Uploading ...' line above for the exact URL)"
    }

    Write-Host '======================================================' -ForegroundColor Cyan
    Write-Host '  Deployment Successful!' -ForegroundColor Green
    Write-Host '======================================================' -ForegroundColor Cyan
    Write-Host "  Site URL   : $liveUrl" -ForegroundColor Green
    Write-Host "  API Base   : https://$swaHostname/api/  (proxied to linked Function App)" -ForegroundColor Green
    Write-Host ''
    Write-Host '  Post-deployment checklist:' -ForegroundColor Cyan
    Write-Host "    [ ] Open $liveUrl and load a photo end-to-end" -ForegroundColor White
    Write-Host '    [ ] Confirm CORS_ORIGIN on the Function App includes the SWA hostname' -ForegroundColor White
    Write-Host "    [ ] Check App Insights: appi-$AppSlug-$($Environment.ToLower())" -ForegroundColor White
    Write-Host ''
} else {
    Write-Host '======================================================' -ForegroundColor Cyan
    Write-Host "  Deployment Failed (exit code $exitCode)." -ForegroundColor Red
    Write-Host '======================================================' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  Troubleshooting:' -ForegroundColor Yellow
    Write-Host '    1. Confirm the SWA is on Free or Standard SKU:' -ForegroundColor White
    Write-Host "         az staticwebapp show --name $($envCfg.SwaName) --resource-group $($envCfg.ResourceGroup) --query sku.name" -ForegroundColor Gray
    Write-Host '    2. Clear the SWA CLI cache and re-download the binary:' -ForegroundColor White
    Write-Host "         Remove-Item -Recurse -Force `"`$env:USERPROFILE\.swa`"" -ForegroundColor Gray
    Write-Host '         npm install -g @azure/static-web-apps-cli@latest' -ForegroundColor Gray
    Write-Host '    3. Try the SWA CLI directly (needs network access to config.edge.azurestaticapps.net):' -ForegroundColor White
    Write-Host "         swa deploy apps/web/dist --deployment-token <token> --env $SwaEnvironmentName" -ForegroundColor Gray
    exit $exitCode
}
