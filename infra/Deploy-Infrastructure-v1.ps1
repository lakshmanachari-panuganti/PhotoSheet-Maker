<#
.SYNOPSIS
    Deploy Azure Infrastructure for PhotoSheet-Maker (DEV or PRD).

.DESCRIPTION
    Creates and configures a complete environment for the PhotoSheet-Maker
    web app. Fully idempotent - re-runs are safe and only apply diffs.

    ── TABLE OF CONTENTS ─────────────────────────────────────────────
       PART A.  Script parameters + connection
       PART B.  Configuration (all environment values, in one place)
       PART C.  Helper functions
       PART D.  Execution (numbered phases)
         Phase 1  Prerequisites
         Phase 2  Create core resources
         Phase 3  Bootstrap deployer-SP RBAC
         Phase 4  Seed Key Vault secrets
         Phase 5  Configure Function App
         Phase 6  Function App MI runtime RBAC
         Phase 7  Link Static Web App backend to Function App
         Phase 8  Verify RBAC + summary
         Phase 9  GitHub Actions CI Service Principal (OIDC federated)

    Observability decision:
      NO Log Analytics workspace is provisioned. Application Insights
      (Phase 2.3) covers all telemetry the SDK reports - requests,
      exceptions, traces, custom metrics - and its 5 GB/month free tier
      covers this app's expected volume with headroom to spare. Adding
      a Log Analytics workspace with a diagnostic-settings feed would
      duplicate the same signal at ~$2.30/GB ingested for near-zero
      additional insight. If the pipeline ever needs KQL over host-level
      FunctionAppLogs, add a workspace + diagnostic setting in one edit
      to Phase 2 and re-run; nothing else changes.
    ──────────────────────────────────────────────────────────────────

    Why this script is much smaller than most Azure deploy scripts:

      PhotoSheet-Maker is a **stateless in-memory** image tool. The build
      spec (§5) forbids the app from writing any uploaded image to disk,
      queue, table, or blob. There is no user database, no auth system, no
      third-party API integration. As a direct consequence:

        * NO storage tables, queues, or containers are provisioned. The
          only storage account is the one Azure Functions requires for
          its runtime state (host locks, WEBSITE_RUN_FROM_PACKAGE mount).
        * NO custom Key Vault secrets beyond the App Insights connection
          string (which contains the ingestion key).
        * NO CORS on the storage account - nothing is served from blob.
        * NO Razorpay, WhatsApp, SMTP, or admin-seeding logic.

      The plan intentionally provisions the minimum needed to host a
      SPA + Functions API and observe it in production.

    Idempotency guarantees per phase:
      Phase 1   Read-only checks.
      Phase 2   Existence-check before every create. MI assign is
                skipped if the identity is already enabled. Key Vault
                RBAC-mode + purge-protection validated on existing vaults.
                AppInsights ConnectionString is always refreshed from a
                full GET if the resource exists.
      Phase 3   Role assignments checked before write. RBAC propagation
                sleep is skipped when nothing new was assigned.
      Phase 4   Each KV secret checked before write; the AI connection
                string is refreshed every run so KV tracks the live value.
      Phase 5   Existing Function App settings are read and MERGED - no
                portal-added key is ever deleted. Function App CORS -
                read current, set only if different.
      Phase 6   Role assignments checked before write; propagation sleep
                skipped when nothing new was assigned.
      Phase 7   Existing backend link inspected; re-linked only if it
                points elsewhere or is absent.
      Phase 8   Read-only verification pass.
      Phase 9   App reg / SP / federated credential / RBAC each checked
                before write.

    The RBAC design:

      ▸ Deployer Service Principal (this script's identity)
          • Key Vault Secrets Officer   → seed AI connection string
          • Storage Blob Data Owner     → allow future blob writes if
                                          the runtime pipeline ever
                                          needs them (currently unused)

      ▸ Function App System-Assigned Managed Identity (runtime)
          • Key Vault Secrets User      → resolve @Microsoft.KeyVault(...)
          • Storage Blob Data Owner     → identity-based AzureWebJobsStorage
          • Monitoring Metrics Publisher → AAD-based App Insights ingest

      ▸ GitHub Actions CI Service Principal (federated via OIDC)
          • Website Contributor on the Function App
             (covers `az functionapp deploy --type zip`; no long-lived
              secret, no publish profile, no basic SCM auth)

.PARAMETER Environment
    Target environment: DEV or PRD.

.PARAMETER Force
    Skip the interactive PRD confirmation prompt (for CI use).

.EXAMPLE
    ./infra/Deploy-Infrastructure-v1.ps1 -Environment DEV

.EXAMPLE
    ./infra/Deploy-Infrastructure-v1.ps1 -Environment PRD -Force

.NOTES
    Prerequisites:
      - PowerShell 7+
      - Az module: Install-Module Az -Scope CurrentUser
        Sub-modules used: Az.Accounts, Az.Resources, Az.Storage, Az.KeyVault,
        Az.Websites, Az.ApplicationInsights, Az.OperationalInsights
        (Az.Functions deliberately NOT required - Function App operations
        use az CLI to sidestep Az.Functions Linux-Consumption bugs).
      - Azure CLI (az) on PATH
      - Env vars MY_APPREG_CLIENT_ID / MY_APPREG_CERT_THUMBPRINT /
        MY_APPREG_TENANT_ID  for an SP holding on the subscription:
          Contributor + Key Vault Administrator + User Access Administrator
#>

# ═══════════════════════════════════════════════════════════════════
#  PART A.  Script parameters + connection
# ═══════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('DEV', 'PRD')]
    [string]$Environment = 'DEV',

    # Skip the interactive PRD confirmation prompt. Required when running
    # from CI / non-interactive PowerShell sessions.
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
& "$PSScriptRoot\Azure-Connectivity.ps1"

# ═══════════════════════════════════════════════════════════════════
#  PART B.  Configuration (all environment-dependent values here)
# ═══════════════════════════════════════════════════════════════════

# App slug drives every resource name. `photosheetmakerv1` (all lowercase)
# stays within Azure's tightest limit: Key Vault names must be <= 24 chars,
# and `kv-photosheetmakerv1-{dev|prd}` = 24 exactly. Storage accounts, which
# must be lowercase-alphanumeric-only, become `stphotosheetmakerv1{env}` =
# 22 chars (max 24). Do NOT extend the slug without recomputing these.
$AppSlug = 'photosheetmakerv1'

# ── B.1  Per-environment resource names ─────────────────────────────
#
# Region choice:
#   Function App / KV / Storage / AI / RG → centralindia
#     (Flex Consumption is available in centralindia as of 2026-01;
#      confirm with `az functionapp list-flexconsumption-locations`)
#   Static Web App                                       → centralus
#     (SWA regions are limited: eastus2, centralus, westus2, westeurope,
#      eastasia. Free/Standard SKUs are edge-served globally, so the
#      "region" only affects the staging environment location.)
$config = @{
    DEV = @{
        ResourceGroup  = "rg-$AppSlug-dev"
        Location       = 'centralindia'
        SwaLocation    = 'centralus'
        StorageAccount = "st$AppSlug`dev"     # backtick escapes $AppSlug from `_`
        FunctionApp    = "func-$AppSlug-dev"
        StaticWebApp   = "swa-$AppSlug-dev"
        KeyVault       = "kv-$AppSlug-dev"
        AppInsights    = "appi-$AppSlug-dev"
        CorsOrigins    = @(
            'http://localhost:5173',   # Vite dev
            'http://127.0.0.1:5173'
            # SWA hostname is appended below once the SWA resource exists;
            # re-run this script after the SWA is provisioned to refresh CORS.
        )
    }
    PRD = @{
        ResourceGroup  = "rg-$AppSlug-prd"
        Location       = 'centralindia'
        SwaLocation    = 'centralus'
        StorageAccount = "st$AppSlug`prd"
        FunctionApp    = "func-$AppSlug-prd"
        StaticWebApp   = "swa-$AppSlug-prd"
        KeyVault       = "kv-$AppSlug-prd"
        AppInsights    = "appi-$AppSlug-prd"
        CorsOrigins    = @()   # populated after PRD SWA custom domain is set
    }
}
$envCfg = $config[$Environment]

# ── B.2  Function App runtime ───────────────────────────────────────
# Node 22 is the current LTS supported by Azure Functions v4 (Node 24 is
# not yet supported on Functions as of 2026-01). Local development runs
# on Node 24; the runtime version is fixed here for the cloud.
$NodeRuntimeVersion = 22

# ── B.3  Function App memory (spec §8) ──────────────────────────────
# 2048 MB per the build spec, sized to handle a worst case of 10 × 50 MP
# inputs at 600 DPI on A4. Flex Consumption bills by GB-second only when
# instances are running, so the higher ceiling is safe on cost.
$FlexInstanceMemoryMb = 2048

# Cap the horizontal scale-out. Flex defaults to 100. For an image-heavy
# workload we prefer fewer, larger instances (already 2 GB) rather than
# a wide fan-out that can starve libvips of file descriptors.
$FlexMaxInstances = 40

# ── B.4  Required PowerShell modules ────────────────────────────────
# Az.Functions is deliberately absent - all Function App operations use
# az CLI to avoid the Az.Functions v4.3.2 GetRuntimeName.ContainsKey()
# null-key bug that crashes on Linux Consumption apps.
$requiredModules = @(
    'Az.Accounts', 'Az.Resources', 'Az.Storage', 'Az.KeyVault',
    'Az.Websites', 'Az.ApplicationInsights'
)

# ── B.5  RBAC role plans ────────────────────────────────────────────
# Deployer SP bootstrap - the minimum needed to seed KV secrets and to
# read/write the Functions runtime storage container during Phase 5.
$sp_BootstrapRoles = @(
    @{ Resource = 'keyvault'; Role = 'Key Vault Secrets Officer'; Why = 'Seed AI connection string in Phase 4' }
    @{ Resource = 'storage';  Role = 'Storage Blob Data Owner';    Why = 'Allow reading/rewriting host state blobs' }
)

# Function App System-Assigned Managed Identity - runtime access only.
# NO Storage Table / Queue Data Contributor roles because this app writes
# nothing to storage beyond the AzureWebJobsStorage host state (which needs
# Owner on the whole blob subresource for identity-based connections; see
# https://learn.microsoft.com/azure/azure-functions/functions-reference#configure-an-identity-based-connection).
$mi_RuntimeRoles = @(
    @{ Resource = 'keyvault';    Role = 'Key Vault Secrets User';    Why = 'Resolve @Microsoft.KeyVault(...) refs at startup' }
    @{ Resource = 'storage';     Role = 'Storage Blob Data Owner';   Why = 'Identity-based AzureWebJobsStorage host state' }
    @{ Resource = 'appinsights'; Role = 'Monitoring Metrics Publisher'; Why = 'AAD-based App Insights telemetry ingest' }
)


# ═══════════════════════════════════════════════════════════════════
#  PART C.  Helper functions
# ═══════════════════════════════════════════════════════════════════

function Write-Step { param([string]$Message)
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "▶ $Message" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}
function Write-Success { param([string]$Message); Write-Host "  ✓ $Message" -ForegroundColor Green }
function Write-Info    { param([string]$Message); Write-Host "  ℹ $Message" -ForegroundColor Yellow }
function Write-Err     { param([string]$Message); Write-Host "  ✗ $Message" -ForegroundColor Red }
function Write-Skip    { param([string]$Message); Write-Host "  – $Message" -ForegroundColor DarkGray }

# Idempotent role assignment. Returns 'assigned' | 'existed' | 'failed'.
function Grant-AzRoleIfMissing {
    param(
        [Parameter(Mandatory)] [string]$ObjectId,
        [Parameter(Mandatory)] [string]$RoleDefinitionName,
        [Parameter(Mandatory)] [string]$Scope,
        [Parameter(Mandatory)] [string]$ScopeLabel
    )
    $existing = Get-AzRoleAssignment `
        -ObjectId           $ObjectId `
        -RoleDefinitionName $RoleDefinitionName `
        -Scope              $Scope `
        -ErrorAction        SilentlyContinue
    if ($existing) {
        Write-Skip "Already assigned : $RoleDefinitionName on $ScopeLabel"
        return 'existed'
    }
    try {
        New-AzRoleAssignment `
            -ObjectId           $ObjectId `
            -RoleDefinitionName $RoleDefinitionName `
            -Scope              $Scope `
            -ErrorAction        Stop | Out-Null
        Write-Success "Assigned         : $RoleDefinitionName on $ScopeLabel"
        return 'assigned'
    } catch {
        Write-Err "Could not assign : $RoleDefinitionName on $ScopeLabel - $($_.Exception.Message.Split([Environment]::NewLine)[0])"
        return 'failed'
    }
}

function Resolve-RoleScope {
    param(
        [Parameter(Mandatory)] [string]$ResourceKey,
        [Parameter(Mandatory)] $StorageAccount,
        [Parameter(Mandatory)] $KeyVault,
        [Parameter(Mandatory)] $AppInsights
    )
    switch ($ResourceKey) {
        'storage'     { return @{ Id = $StorageAccount.Id;     Label = "Storage    [$($StorageAccount.StorageAccountName)]" } }
        'keyvault'    { return @{ Id = $KeyVault.ResourceId;   Label = "KeyVault   [$($KeyVault.VaultName)]" } }
        'appinsights' { return @{ Id = $AppInsights.Id;        Label = "AppInsights[$($AppInsights.Name)]" } }
        default       { throw "Unknown role-plan resource key: '$ResourceKey'" }
    }
}

# Returns hashtable @{ New = <int>; Failed = <int> }. Callers use New > 0
# to decide whether to sleep for RBAC propagation.
function Invoke-RolePlan {
    param(
        [Parameter(Mandatory)] [string]$ObjectId,
        [Parameter(Mandatory)] [object[]]$Plan,
        [Parameter(Mandatory)] $StorageAccount,
        [Parameter(Mandatory)] $KeyVault,
        [Parameter(Mandatory)] $AppInsights
    )
    $newCount = 0
    $failCount = 0
    foreach ($entry in $Plan) {
        $scope = Resolve-RoleScope `
            -ResourceKey    $entry.Resource `
            -StorageAccount $StorageAccount `
            -KeyVault       $KeyVault `
            -AppInsights    $AppInsights
        $result = Grant-AzRoleIfMissing `
            -ObjectId           $ObjectId `
            -RoleDefinitionName $entry.Role `
            -Scope              $scope.Id `
            -ScopeLabel         $scope.Label
        if ($result -eq 'assigned') { $newCount++ }
        if ($result -eq 'failed')   { $failCount++ }
    }
    return @{ New = $newCount; Failed = $failCount }
}


# ═══════════════════════════════════════════════════════════════════
#  PART D.  Execution
# ═══════════════════════════════════════════════════════════════════

Write-Host @"

╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║       PhotoSheet-Maker - Infrastructure Deployment v1         ║
║       (Fully idempotent - safe to re-run)                     ║
║                                                               ║
║       Environment: $($Environment.PadRight(43))║
║       Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')                               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

if ($Environment -eq 'PRD') {
    Write-Host "`n  ⚠  You are about to modify PRODUCTION infrastructure." -ForegroundColor Red
    if ($Force) {
        Write-Host "  -Force supplied - skipping interactive confirmation." -ForegroundColor Yellow
    } else {
        $confirm = Read-Host "  Type 'yes' to continue"
        if ($confirm -ne 'yes') { Write-Info "Aborted by operator."; exit 0 }
    }
}


# ─────────────────────────────────────────────────────────────────
#  PHASE 1.  Prerequisites
# ─────────────────────────────────────────────────────────────────
Write-Step "PHASE 1 - Prerequisites"

foreach ($mod in $requiredModules) {
    if (-not (Get-Module -ListAvailable -Name $mod)) {
        Write-Err "Missing module: $mod  →  Install-Module Az -Scope CurrentUser"
        exit 1
    }
    Write-Success "Module available : $mod"
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Err "Missing 'az' CLI on PATH  →  https://aka.ms/installazurecli"
    exit 1
}
Write-Success "az CLI available"

$context = Get-AzContext
if (-not $context) {
    Write-Err "Not logged in. Azure-Connectivity.ps1 should have authenticated - check the output above."
    exit 1
}
Write-Success "Logged in as      : $($context.Account.Id)"
Write-Success "Subscription      : $($context.Subscription.Name) ($($context.Subscription.Id))"

az account set --subscription $context.Subscription.Id --output none
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to pin az CLI to subscription $($context.Subscription.Id)."
    exit 1
}
Write-Success "az CLI sub pinned : $($context.Subscription.Id)"

$spObjectId = (Get-AzADServicePrincipal -ApplicationId $env:MY_APPREG_CLIENT_ID).Id
if (-not $spObjectId) {
    Write-Err "Could not resolve SP object ID for client ID '$env:MY_APPREG_CLIENT_ID'."
    exit 1
}
Write-Success "Deployer SP       : $spObjectId"


# ─────────────────────────────────────────────────────────────────
#  PHASE 2.  Create core resources
# ─────────────────────────────────────────────────────────────────
Write-Step "PHASE 2 - Create core resources"

# ── 2.1  Resource Group ──────────────────────────────────────────
$rg = Get-AzResourceGroup -Name $envCfg.ResourceGroup -ErrorAction SilentlyContinue
if ($rg) {
    Write-Skip "Resource Group exists        : $($envCfg.ResourceGroup)"
} else {
    Write-Info "Creating Resource Group      : $($envCfg.ResourceGroup)"
    New-AzResourceGroup -Name $envCfg.ResourceGroup -Location $envCfg.Location -Tag @{
        project   = $AppSlug
        env       = $Environment.ToLower()
        managedBy = 'Deploy-Infrastructure-v1.ps1'
    } | Out-Null
    Write-Success "Resource Group created       : $($envCfg.ResourceGroup)"
}

# ── 2.2  Storage Account (Functions runtime state only) ──────────
# Standard_LRS is fine for Function App host state - the app itself does
# NOT persist images here (spec §5). AllowBlobPublicAccess=false because
# no blob is ever served publicly. EnableHttpsTrafficOnly=true is the
# platform default now but pinned explicitly to survive Portal edits.
$storageAccount = Get-AzStorageAccount `
    -ResourceGroupName $envCfg.ResourceGroup `
    -Name              $envCfg.StorageAccount `
    -ErrorAction       SilentlyContinue
if ($storageAccount) {
    Write-Skip "Storage Account exists       : $($envCfg.StorageAccount)"
} else {
    Write-Info "Creating Storage Account     : $($envCfg.StorageAccount)"
    $storageAccount = New-AzStorageAccount `
        -ResourceGroupName      $envCfg.ResourceGroup `
        -Name                   $envCfg.StorageAccount `
        -Location               $envCfg.Location `
        -SkuName                'Standard_LRS' `
        -Kind                   'StorageV2' `
        -AccessTier             'Hot' `
        -AllowBlobPublicAccess  $false `
        -EnableHttpsTrafficOnly $true `
        -MinimumTlsVersion      'TLS1_2'
    Write-Success "Storage Account created      : $($envCfg.StorageAccount)"
}

# ── 2.2a  Storage minimum TLS version (idempotent re-assert) ─────
if ($storageAccount.MinimumTlsVersion -ne 'TLS1_2') {
    Write-Info "Setting storage min TLS      : TLS1_2"
    Set-AzStorageAccount `
        -ResourceGroupName $envCfg.ResourceGroup `
        -Name              $envCfg.StorageAccount `
        -MinimumTlsVersion 'TLS1_2' | Out-Null
    Write-Success "Storage min TLS enforced     : TLS1_2"
} else {
    Write-Skip "Storage min TLS              : already TLS1_2"
}

# ── 2.3  Application Insights ────────────────────────────────────
# Always re-GET on an existing resource to guarantee ConnectionString +
# InstrumentationKey are populated (occasionally missing on stale objects).
$appInsights = Get-AzApplicationInsights `
    -ResourceGroupName $envCfg.ResourceGroup `
    -Name              $envCfg.AppInsights `
    -ErrorAction       SilentlyContinue
if ($appInsights) {
    Write-Skip "Application Insights exists  : $($envCfg.AppInsights)"
    $appInsights = Get-AzApplicationInsights `
        -ResourceGroupName $envCfg.ResourceGroup `
        -Name              $envCfg.AppInsights
} else {
    Write-Info "Creating Application Insights: $($envCfg.AppInsights)"
    $appInsights = New-AzApplicationInsights `
        -ResourceGroupName $envCfg.ResourceGroup `
        -Name              $envCfg.AppInsights `
        -Location          $envCfg.Location `
        -Kind              'web' `
        -ApplicationType   'web'
    Write-Success "Application Insights created : $($envCfg.AppInsights)"
}
if (-not $appInsights.ConnectionString) {
    throw "Application Insights '$($envCfg.AppInsights)' has no ConnectionString. The resource may still be provisioning - wait 30s and re-run."
}

# ── 2.4  Function App (Flex Consumption, Node 22) ────────────────
# Flex Consumption is the SKU mandated by the spec (§3). Compared to
# Linux Consumption:
#   - Faster cold starts (usually seconds vs tens of seconds)
#   - Per-instance memory selectable (spec §8 needs 2 GB for 50 MP × 10)
#   - Concurrency and always-ready instance controls
#   - Priced by GB-second, not fixed plan tier
#
# az functionapp show exits 3 (ResourceNotFoundError) when the app does
# not exist. PS7.4+ default $PSNativeCommandUseErrorActionPreference=$true
# turns that into a terminating error - toggle off and check explicitly.
$functionApp = $null
$savedNativePref = $PSNativeCommandUseErrorActionPreference
$PSNativeCommandUseErrorActionPreference = $false
try {
    $functionAppJson = az functionapp show `
        --name           $envCfg.FunctionApp `
        --resource-group $envCfg.ResourceGroup `
        --output         json 2>$null
    $showExit = $LASTEXITCODE
} finally {
    $PSNativeCommandUseErrorActionPreference = $savedNativePref
}

if ($showExit -eq 0 -and $functionAppJson) {
    $functionApp = $functionAppJson | ConvertFrom-Json
    Write-Skip "Function App exists          : $($envCfg.FunctionApp)"
} elseif ($showExit -ne 0 -and $showExit -ne 3) {
    throw "az functionapp show exited with code $showExit - check subscription / RG access."
} else {
    Write-Info "Creating Function App (Flex) : $($envCfg.FunctionApp)"
    $functionAppJson = az functionapp create `
        --name                     $envCfg.FunctionApp `
        --resource-group           $envCfg.ResourceGroup `
        --storage-account          $envCfg.StorageAccount `
        --flexconsumption-location $envCfg.Location `
        --runtime                  node `
        --runtime-version          $NodeRuntimeVersion `
        --instance-memory          $FlexInstanceMemoryMb `
        --maximum-instance-count   $FlexMaxInstances `
        --output                   json
    if ($LASTEXITCODE -ne 0) {
        throw @"
Failed to create Function App on Flex Consumption. Common causes:
  - Region '$($envCfg.Location)' has no Flex Consumption quota yet.
    Check: az functionapp list-flexconsumption-locations
  - Node $NodeRuntimeVersion is not yet available for Flex in that region.
    Check: az functionapp list-flexconsumption-runtimes
"@
    }
    $functionApp = $functionAppJson | ConvertFrom-Json
    Write-Success "Function App created (Flex)  : $($envCfg.FunctionApp)"
}

# ── 2.4a  Function App httpsOnly enforcement ─────────────────────
if ($functionApp.httpsOnly -eq $true) {
    Write-Skip "Function App httpsOnly       : already true"
} else {
    az functionapp update `
        --name           $envCfg.FunctionApp `
        --resource-group $envCfg.ResourceGroup `
        --set            httpsOnly=true `
        --output         none
    if ($LASTEXITCODE -ne 0) { throw "Failed to enable httpsOnly on Function App." }
    Write-Success "Function App httpsOnly       : enabled"
}

# ── 2.5  Key Vault ───────────────────────────────────────────────
# EnableRbacAuthorization=$true so RBAC role assignments (Secrets User)
# actually gate data-plane access. Access Policy mode silently 403s
# every RBAC role. EnablePurgeProtection=$true on both DEV and PRD -
# once enabled it is IRREVERSIBLE.
$keyVault = Get-AzKeyVault `
    -ResourceGroupName $envCfg.ResourceGroup `
    -VaultName         $envCfg.KeyVault `
    -ErrorAction       SilentlyContinue
if ($keyVault) {
    Write-Skip "Key Vault exists             : $($envCfg.KeyVault)"
    if (-not $keyVault.EnableRbacAuthorization) {
        Write-Err "Key Vault '$($envCfg.KeyVault)' is in Access Policy mode, not RBAC mode."
        Write-Err "RBAC role assignments will be silently ignored on data-plane ops → 403."
        Write-Err "To fix: az keyvault update --name $($envCfg.KeyVault) --enable-rbac-authorization true"
        throw "Existing Key Vault is not in RBAC authorization mode."
    }
    Write-Success "Key Vault RBAC mode          : confirmed"

    if ($keyVault.EnablePurgeProtection -eq $true) {
        Write-Skip "Key Vault purgeProtection   : already enabled"
    } else {
        az keyvault update `
            --name              $envCfg.KeyVault `
            --resource-group    $envCfg.ResourceGroup `
            --enable-purge-protection true `
            --output            none
        if ($LASTEXITCODE -ne 0) { throw "Failed to enable Key Vault purge protection." }
        Write-Success "Key Vault purgeProtection   : enabled (irreversible)"
    }
} else {
    Write-Info "Creating Key Vault           : $($envCfg.KeyVault)"
    $kvParams = @{
        Name                    = $envCfg.KeyVault
        ResourceGroupName       = $envCfg.ResourceGroup
        Location                = $envCfg.Location
        Sku                     = 'Standard'
        EnableRbacAuthorization = $true
        EnablePurgeProtection   = $true
    }
    Write-Info "Purge protection enabled on Key Vault (irreversible)"
    $keyVault = New-AzKeyVault @kvParams
    Write-Success "Key Vault created            : $($envCfg.KeyVault)"
}

# ── 2.6  Function App System-Assigned Managed Identity ───────────
# Skip the assign if it's already enabled - avoids a spurious rewrite of
# the identity block on every re-run.
$identityRaw = az functionapp identity show `
    --name           $envCfg.FunctionApp `
    --resource-group $envCfg.ResourceGroup `
    --output         json 2>$null
$currentIdentity = if ([string]::IsNullOrWhiteSpace($identityRaw)) { $null } else { $identityRaw | ConvertFrom-Json }

if ($currentIdentity -and $currentIdentity.type -like '*SystemAssigned*' -and $currentIdentity.principalId) {
    $miPrincipalId = $currentIdentity.principalId
    Write-Skip "FA System-Assigned MI exists : $miPrincipalId"
} else {
    Write-Info "Enabling FA System-Assigned MI"
    $assigned = az functionapp identity assign `
        --name           $envCfg.FunctionApp `
        --resource-group $envCfg.ResourceGroup `
        --output         json | ConvertFrom-Json
    $miPrincipalId = $assigned.principalId
    Write-Success "FA System-Assigned MI        : $miPrincipalId"
}

# ── 2.7  Static Web App ──────────────────────────────────────────
# Free SKU (no cost). Provisioned unconnected - the operator wires it to
# GitHub in the Portal (or via `az staticwebapp update --source ...`) to
# enable CI/CD. We do not automate GitHub linking because it needs a PAT
# with repo scope, which we intentionally do not surface in this script.
$swaRaw = az staticwebapp show `
    --name           $envCfg.StaticWebApp `
    --resource-group $envCfg.ResourceGroup `
    --output         json 2>$null
$swaExisted = $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($swaRaw)

if ($swaExisted) {
    $staticWebApp = $swaRaw | ConvertFrom-Json
    Write-Skip "Static Web App exists        : $($envCfg.StaticWebApp)"
} else {
    Write-Info "Creating Static Web App      : $($envCfg.StaticWebApp)"
    $staticWebApp = az staticwebapp create `
        --name           $envCfg.StaticWebApp `
        --resource-group $envCfg.ResourceGroup `
        --location       $envCfg.SwaLocation `
        --sku            Free `
        --output         json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Failed to create Static Web App." }
    Write-Success "Static Web App created       : $($envCfg.StaticWebApp)"
}

# Add the SWA default hostname to the CORS allow list. Custom domains
# (once configured) should be added manually to CorsOrigins in Part B.1.
if ($staticWebApp.defaultHostname) {
    $swaOrigin = "https://$($staticWebApp.defaultHostname)"
    if ($envCfg.CorsOrigins -notcontains $swaOrigin) {
        $envCfg.CorsOrigins = @($envCfg.CorsOrigins) + $swaOrigin
    }
}


# ─────────────────────────────────────────────────────────────────
#  PHASE 3.  Bootstrap deployer-SP RBAC
# ─────────────────────────────────────────────────────────────────
# The deployer SP must be able to write KV secrets (Phase 4) and hold
# blob owner over the storage account (needed for future runtime-state
# reads). Roles are checked before write; if all already exist, no sleep.
Write-Step "PHASE 3 - Bootstrap deployer-SP RBAC"

$spBootstrapOutcome = Invoke-RolePlan `
    -ObjectId       $spObjectId `
    -Plan           $sp_BootstrapRoles `
    -StorageAccount $storageAccount `
    -KeyVault       $keyVault `
    -AppInsights    $appInsights

if ($spBootstrapOutcome.Failed -gt 0) {
    Write-Err "$($spBootstrapOutcome.Failed) deployer-SP role assignments failed. Phase 4 will likely 403."
}
if ($spBootstrapOutcome.New -gt 0) {
    Write-Info "Waiting 30s for RBAC propagation..."
    Start-Sleep -Seconds 30
} else {
    Write-Skip "No new role assignments - skipping propagation wait."
}


# ─────────────────────────────────────────────────────────────────
#  PHASE 4.  Seed Key Vault secrets
# ─────────────────────────────────────────────────────────────────
# PhotoSheet-Maker has no JWT, no CSRF, no invoice signer, no third-party
# API keys. The ONLY secret we store is the App Insights connection string
# (contains the ingestion key). Refreshed every run in case AI was rotated.
Write-Step "PHASE 4 - Seed Key Vault secrets"

Set-AzKeyVaultSecret `
    -VaultName   $envCfg.KeyVault `
    -Name        'ApplicationInsightsConnectionString' `
    -SecretValue (ConvertTo-SecureString $appInsights.ConnectionString -AsPlainText -Force) | Out-Null
Write-Success "Stored secret : ApplicationInsightsConnectionString (refreshed from AI resource)"


# ─────────────────────────────────────────────────────────────────
#  PHASE 5.  Configure Function App
# ─────────────────────────────────────────────────────────────────
Write-Step "PHASE 5 - Configure Function App"

# ── 5.1  App settings ────────────────────────────────────────────
#
# Three categories:
#   ALWAYS-OVERWRITE  - infra-derived (storage identity URIs, KV refs,
#     CORS). Must track infra state every run.
#   DEFAULT-IF-ABSENT - operator-tunable defaults (log level, feature
#     flags). Set on first deploy; left alone thereafter.
#
# Strategy: read existing, merge locally, send the merged set. Portal-
# added keys are preserved.

$existingJson = az functionapp config appsettings list `
    --name           $envCfg.FunctionApp `
    --resource-group $envCfg.ResourceGroup `
    --output         json
if ($LASTEXITCODE -ne 0) { throw "Failed to read existing Function App settings." }

$mergedSettings = @{}
if ($existingJson) {
    foreach ($item in ($existingJson | ConvertFrom-Json)) {
        $mergedSettings[$item.name] = $item.value
    }
}

# ALWAYS-OVERWRITE
$alwaysOverwrite = @{
    # Identity-based AzureWebJobsStorage (spec §5: no connection-string
    # secrets stored inline; the FA MI holds Storage Blob Data Owner).
    'AzureWebJobsStorage__accountName'          = $envCfg.StorageAccount
    'AzureWebJobsStorage__blobServiceUri'       = "https://$($envCfg.StorageAccount).blob.core.windows.net"
    'AzureWebJobsStorage__queueServiceUri'      = "https://$($envCfg.StorageAccount).queue.core.windows.net"
    'AzureWebJobsStorage__tableServiceUri'      = "https://$($envCfg.StorageAccount).table.core.windows.net"

    # App Insights (secret via KV ref; SDK reads AAD-authenticated)
    'APPLICATIONINSIGHTS_CONNECTION_STRING'     = "@Microsoft.KeyVault(VaultName=$($envCfg.KeyVault);SecretName=ApplicationInsightsConnectionString)"
    'APPLICATIONINSIGHTS_AUTHENTICATION_STRING' = 'Authorization=AAD'

    # Runtime
    'FUNCTIONS_WORKER_RUNTIME'                  = 'node'
    'WEBSITE_RUN_FROM_PACKAGE'                  = '1'

    # App-level config
    'ENVIRONMENT'                               = $Environment
    'CORS_ORIGIN'                               = ($envCfg.CorsOrigins -join ',')
    'PUBLIC_SITE_URL'                           = if ($staticWebApp.defaultHostname) { "https://$($staticWebApp.defaultHostname)" } else { '' }
}
foreach ($k in $alwaysOverwrite.Keys) { $mergedSettings[$k] = $alwaysOverwrite[$k] }

# DEFAULT-IF-ABSENT
$defaultIfAbsent = @{
    # Server-side image processing knobs. Runtime code reads these; sensible
    # defaults per spec §6 / §8. Operator can override per env in the Portal
    # without a code deploy.
    'PHOTOSHEET_DEFAULT_DPI'          = '300'
    'PHOTOSHEET_MAX_FILE_MB'          = '10'
    'PHOTOSHEET_MAX_FILES_PER_REQ'    = '10'
    'PHOTOSHEET_MAX_INPUT_MEGAPIXELS' = '50'
    'PHOTOSHEET_PER_IMAGE_TIMEOUT_MS' = '20000'
    'PHOTOSHEET_REQUEST_BUDGET_MS'    = '90000'
    'LOG_LEVEL'                       = 'info'
}
foreach ($k in $defaultIfAbsent.Keys) {
    if (-not $mergedSettings.ContainsKey($k) -or [string]::IsNullOrEmpty($mergedSettings[$k])) {
        $mergedSettings[$k] = $defaultIfAbsent[$k]
    }
}

# Send merged settings in a single call. Serialize each entry as
# key=value; az functionapp config appsettings set MERGES with existing.
$settingsArgs = @()
foreach ($k in $mergedSettings.Keys) { $settingsArgs += "$k=$($mergedSettings[$k])" }

az functionapp config appsettings set `
    --name           $envCfg.FunctionApp `
    --resource-group $envCfg.ResourceGroup `
    --settings       @settingsArgs `
    --output         none
if ($LASTEXITCODE -ne 0) { throw "Failed to apply Function App settings." }
Write-Success "App settings applied         : $($mergedSettings.Count) keys"

# ── 5.2  Function App platform CORS ──────────────────────────────
# Read-then-diff so we don't rewrite CORS on every run.
$currentCorsJson = az functionapp cors show `
    --name           $envCfg.FunctionApp `
    --resource-group $envCfg.ResourceGroup `
    --output         json 2>$null
$currentCors = if ([string]::IsNullOrWhiteSpace($currentCorsJson)) { @() } else {
    ($currentCorsJson | ConvertFrom-Json).allowedOrigins
}
$desiredSet = @($envCfg.CorsOrigins) | Sort-Object -Unique
$currentSet = @($currentCors) | Sort-Object -Unique
if (Compare-Object -ReferenceObject $currentSet -DifferenceObject $desiredSet -SyncWindow 0) {
    Write-Info "Updating Function App CORS   : $($desiredSet -join ', ')"
    foreach ($existingOrigin in $currentCors) {
        az functionapp cors remove `
            --name           $envCfg.FunctionApp `
            --resource-group $envCfg.ResourceGroup `
            --allowed-origins $existingOrigin `
            --output         none 2>$null | Out-Null
    }
    foreach ($origin in $envCfg.CorsOrigins) {
        az functionapp cors add `
            --name           $envCfg.FunctionApp `
            --resource-group $envCfg.ResourceGroup `
            --allowed-origins $origin `
            --output         none | Out-Null
    }
    Write-Success "Function App CORS updated"
} else {
    Write-Skip "Function App CORS matches desired - not touched"
}

# ── 5.3  Fetch Function App resource handle (needed by Phase 7/9) ─
# Not a mutation; just resolves the ARM resource ID so downstream phases
# (SWA backend link, CI SP role assignment) do not need to re-query.
$faResource = Get-AzResource `
    -ResourceGroupName $envCfg.ResourceGroup `
    -ResourceType      'Microsoft.Web/sites' `
    -Name              $envCfg.FunctionApp

# ── 5.4  Application Insights disableLocalAuth ───────────────────
# Force AAD-authenticated telemetry ingest. Blocks the legacy ingestion-key
# path so a leaked key can't inject fake telemetry from outside the FA.
if ($appInsights.DisableLocalAuth -eq $true) {
    Write-Skip "App Insights disableLocalAuth: already true"
} else {
    Write-Info "Setting AI disableLocalAuth   : true"
    az resource update `
        --ids  $appInsights.Id `
        --set  properties.DisableLocalAuth=true `
        --output none | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to set AI disableLocalAuth." }
    Write-Success "App Insights disableLocalAuth: enabled"
}


# ─────────────────────────────────────────────────────────────────
#  PHASE 6.  Function App MI + runtime RBAC
# ─────────────────────────────────────────────────────────────────
Write-Step "PHASE 6 - Function App MI runtime RBAC"

$miRuntimeOutcome = Invoke-RolePlan `
    -ObjectId       $miPrincipalId `
    -Plan           $mi_RuntimeRoles `
    -StorageAccount $storageAccount `
    -KeyVault       $keyVault `
    -AppInsights    $appInsights

if ($miRuntimeOutcome.Failed -gt 0) {
    Write-Err "$($miRuntimeOutcome.Failed) FA-MI role assignments failed. Runtime KV-ref resolution may 403."
}
if ($miRuntimeOutcome.New -gt 0) {
    Write-Info "Waiting 30s for RBAC propagation..."
    Start-Sleep -Seconds 30
} else {
    Write-Skip "No new role assignments - skipping propagation wait."
}


# ─────────────────────────────────────────────────────────────────
#  PHASE 7.  Link Static Web App backend to Function App
# ─────────────────────────────────────────────────────────────────
# SWA linking creates the /api reverse proxy: requests to
# https://<swa-hostname>/api/generate hit the Function App directly.
# The link uses the FA managed identity, no shared secret involved.
Write-Step "PHASE 7 - Link SWA backend to Function App"

$existingBackends = az staticwebapp backends show `
    --name           $envCfg.StaticWebApp `
    --resource-group $envCfg.ResourceGroup `
    --output         json 2>$null
$backendsList = if ([string]::IsNullOrWhiteSpace($existingBackends)) { @() } else {
    @($existingBackends | ConvertFrom-Json)
}

$currentBackendId = if ($backendsList.Count -gt 0 -and $backendsList[0].PSObject.Properties['backendResourceId']) {
    $backendsList[0].backendResourceId
} else { $null }

if ($currentBackendId -eq $faResource.ResourceId) {
    Write-Skip "SWA backend already linked   : $($envCfg.FunctionApp)"
} elseif ($currentBackendId) {
    Write-Info "SWA backend points to a different resource - re-linking."
    az staticwebapp backends unlink `
        --name           $envCfg.StaticWebApp `
        --resource-group $envCfg.ResourceGroup `
        --output         none | Out-Null
    az staticwebapp backends link `
        --name                  $envCfg.StaticWebApp `
        --resource-group        $envCfg.ResourceGroup `
        --backend-resource-id   $faResource.ResourceId `
        --backend-region        $envCfg.Location `
        --output                none | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to link SWA backend." }
    Write-Success "SWA backend re-linked        : $($envCfg.FunctionApp)"
} else {
    Write-Info "Linking SWA backend          : $($envCfg.FunctionApp)"
    az staticwebapp backends link `
        --name                  $envCfg.StaticWebApp `
        --resource-group        $envCfg.ResourceGroup `
        --backend-resource-id   $faResource.ResourceId `
        --backend-region        $envCfg.Location `
        --output                none | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to link SWA backend." }
    Write-Success "SWA backend linked           : $($envCfg.FunctionApp)"
}


# ─────────────────────────────────────────────────────────────────
#  PHASE 8.  Verify RBAC + summary
# ─────────────────────────────────────────────────────────────────
Write-Step "PHASE 8 - Verify RBAC"

$verifyErrors = 0

function Test-RoleAssigned {
    param(
        [Parameter(Mandatory)] [string]$ObjectId,
        [Parameter(Mandatory)] [string]$RoleDefinitionName,
        [Parameter(Mandatory)] [string]$Scope,
        [Parameter(Mandatory)] [string]$Label
    )
    $existing = Get-AzRoleAssignment `
        -ObjectId           $ObjectId `
        -RoleDefinitionName $RoleDefinitionName `
        -Scope              $Scope `
        -ErrorAction        SilentlyContinue
    if ($existing) {
        Write-Success "$Label : $RoleDefinitionName"
        return $true
    } else {
        Write-Err "$Label : MISSING $RoleDefinitionName"
        return $false
    }
}

foreach ($entry in $sp_BootstrapRoles) {
    $scope = Resolve-RoleScope -ResourceKey $entry.Resource `
        -StorageAccount $storageAccount -KeyVault $keyVault -AppInsights $appInsights
    if (-not (Test-RoleAssigned -ObjectId $spObjectId -RoleDefinitionName $entry.Role -Scope $scope.Id -Label "Deployer   $($scope.Label)")) {
        $verifyErrors++
    }
}
foreach ($entry in $mi_RuntimeRoles) {
    $scope = Resolve-RoleScope -ResourceKey $entry.Resource `
        -StorageAccount $storageAccount -KeyVault $keyVault -AppInsights $appInsights
    if (-not (Test-RoleAssigned -ObjectId $miPrincipalId -RoleDefinitionName $entry.Role -Scope $scope.Id -Label "FA MI      $($scope.Label)")) {
        $verifyErrors++
    }
}

if ($verifyErrors -gt 0) {
    Write-Err "$verifyErrors role assignments are missing. Re-run this script after the RBAC propagation window (~1 min)."
}


# ─────────────────────────────────────────────────────────────────
#  PHASE 9.  GitHub Actions CI Service Principal (OIDC federated)
# ─────────────────────────────────────────────────────────────────
#
# Provisions a dedicated service principal for the GitHub Actions deploy
# workflow. Auth flow:
#
#   GitHub → mints a short-lived OIDC token per job
#   GitHub → presents token to Entra
#   Entra  → exchanges for an AAD access token IF a matching federated
#            credential exists on the app registration
#
# Result: no long-lived secret, no publish profile, no SCM basic auth
# stored as a GitHub repo secret. Only AZURE_CLIENT_ID / _TENANT_ID /
# _SUBSCRIPTION_ID.
#
# Components per environment:
#   App Reg          : sp-github-actions-<slug>-<env>
#   Federated cred   : DEV → repo:<owner>/<repo>:ref:refs/heads/develop
#                      PRD → repo:<owner>/<repo>:environment:production
#   Runtime RBAC     : Website Contributor on the Function App
#                      (minimal role for `az functionapp deploy --type zip`;
#                       zero storage-account access)
#
# Prerequisites for the DEPLOYER SP running THIS script:
#   - Application.ReadWrite.OwnedBy on Microsoft Graph  OR  the Entra
#     Application Administrator role - to create the CI app registration.
#   - User Access Administrator (already documented) - to grant Website
#     Contributor in step 9.4.

Write-Step "PHASE 9 - GitHub Actions CI Service Principal (OIDC)"

# 9.0  Repo + per-environment subject claims
$GitHubOwner = 'lakshmanachari-panuganti'
$GitHubRepo  = 'PhotoSheet-Maker'
$ciSpName    = "sp-github-actions-$AppSlug-$($Environment.ToLower())"

$federatedSubjects = if ($Environment -eq 'PRD') {
    @(@{
            Name    = 'github-actions-environment-production'
            Subject = "repo:$GitHubOwner/$GitHubRepo`:environment:production"
        })
} else {
    @(@{
            Name    = 'github-actions-develop'
            Subject = "repo:$GitHubOwner/$GitHubRepo`:ref:refs/heads/develop"
        })
}

# 9.1  App Registration
$ciAppRaw = az ad app list --display-name $ciSpName --query "[0]" --output json 2>$null
$ciAppExisted = -not [string]::IsNullOrWhiteSpace($ciAppRaw) -and $ciAppRaw -ne 'null'
if ($ciAppExisted) {
    $ciApp = $ciAppRaw | ConvertFrom-Json
    Write-Skip "App Registration exists  : $ciSpName"
} else {
    Write-Info "Creating App Registration: $ciSpName"
    az ad app create --display-name $ciSpName --sign-in-audience AzureADMyOrg --output none
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create app registration '$ciSpName'. The deployer SP needs Application.ReadWrite.OwnedBy on Microsoft Graph (or an Entra role such as Application Administrator)."
    }
    $ciApp = az ad app list --display-name $ciSpName --query "[0]" --output json | ConvertFrom-Json
    Write-Success "App Registration created : $ciSpName"
}

# 9.2  Service Principal
$ciSpRaw = az ad sp list --filter "appId eq '$($ciApp.appId)'" --query "[0]" --output json 2>$null
$ciSpExisted = -not [string]::IsNullOrWhiteSpace($ciSpRaw) -and $ciSpRaw -ne 'null'
if ($ciSpExisted) {
    $ciSp = $ciSpRaw | ConvertFrom-Json
    Write-Skip "Service Principal exists : $ciSpName"
} else {
    Write-Info "Creating Service Principal: $ciSpName"
    az ad sp create --id $ciApp.appId --output none
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create service principal for '$ciSpName' (appId=$($ciApp.appId))."
    }
    $ciSp = az ad sp list --filter "appId eq '$($ciApp.appId)'" --query "[0]" --output json | ConvertFrom-Json
    Write-Success "Service Principal created: $ciSpName"
    # Newly-created SPs aren't immediately visible to RBAC reads in some
    # regions; small pause prevents a transient "PrincipalNotFound" below.
    Start-Sleep -Seconds 10
}

# 9.3  Federated credential(s)
$existingFedRaw = az ad app federated-credential list --id $ciApp.id --output json 2>$null
$existingFed = if ([string]::IsNullOrWhiteSpace($existingFedRaw)) { @() } else { $existingFedRaw | ConvertFrom-Json }

foreach ($fc in $federatedSubjects) {
    $match = $existingFed | Where-Object { $_.subject -eq $fc.Subject }
    if ($match) {
        Write-Skip "Federated credential exists: $($fc.Name) ($($fc.Subject))"
        continue
    }
    Write-Info "Adding federated credential : $($fc.Name)"
    $params = @{
        name      = $fc.Name
        issuer    = 'https://token.actions.githubusercontent.com'
        subject   = $fc.Subject
        audiences = @('api://AzureADTokenExchange')
    } | ConvertTo-Json -Compress
    az ad app federated-credential create --id $ciApp.id --parameters $params --output none
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to add federated credential '$($fc.Name)' on $ciSpName."
    }
    Write-Success "Federated credential added : $($fc.Name)"
}

# 9.4  RBAC: minimal role for zip-deploy on the Function App resource.
# Website Contributor is intentionally the ONLY role granted to the CI SP -
# it covers `az functionapp deploy --type zip` (OneDeploy over AAD, no SCM
# basic auth) and updating app settings. No storage-account access is
# granted: WEBSITE_RUN_FROM_PACKAGE=1 uses local mount from the SCM host,
# so CI never writes to blob storage.
$ciRoleOutcome = Grant-AzRoleIfMissing `
    -ObjectId           $ciSp.id `
    -RoleDefinitionName 'Website Contributor' `
    -Scope              $faResource.ResourceId `
    -ScopeLabel         "Function App [$($envCfg.FunctionApp)]"

# 9.5  Print the values to paste into GitHub repo secrets
$tenantId = $context.Tenant.Id
$subId    = $context.Subscription.Id
$envUpper = $Environment.ToUpper()

Write-Host ''
Write-Host "  → Paste into GitHub repo Settings → Secrets and variables → Actions" -ForegroundColor Cyan
Write-Host "       AZURE_CLIENT_ID_$envUpper = $($ciApp.appId)" -ForegroundColor White
Write-Host "       AZURE_TENANT_ID          = $tenantId" -ForegroundColor White
Write-Host "       AZURE_SUBSCRIPTION_ID    = $subId" -ForegroundColor White
Write-Host ''


# ─────────────────────────────────────────────────────────────────
#  Final summary
# ─────────────────────────────────────────────────────────────────
$functionUrl = "https://$($envCfg.FunctionApp).azurewebsites.net"
$swaHostname = if ($staticWebApp.defaultHostname) { $staticWebApp.defaultHostname } else { '<not-provisioned>' }

Write-Host @"

╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║                   DEPLOYMENT COMPLETE ✓                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Environment          : $Environment
Resource Group       : $($envCfg.ResourceGroup)
Storage Account      : $($envCfg.StorageAccount)
Function App (Flex)  : $($envCfg.FunctionApp) — Node $NodeRuntimeVersion, $FlexInstanceMemoryMb MB, max $FlexMaxInstances instances
Static Web App       : $($envCfg.StaticWebApp)  → https://$swaHostname
Application Insights : $($envCfg.AppInsights)  (5 GB/month free tier - no Log Analytics)
Key Vault            : $($envCfg.KeyVault)
Function App URL     : $functionUrl

🔐 Key Vault Secrets
   • ApplicationInsightsConnectionString  (refreshed each run from AI)

🌐 CORS Origins
$(($envCfg.CorsOrigins | ForEach-Object { "   • $_" }) -join [Environment]::NewLine)

📋 Next Steps
   1. Deploy backend code           : from CI, or  cd apps/api  &&  func azure functionapp publish $($envCfg.FunctionApp)
   2. Link SWA to GitHub repo       : Portal → Static Web App → Deployment → Source
                                       (needs a GitHub PAT scoped to this repo)
   3. Add SWA custom domain (PRD)   : Portal → Static Web App → Custom domains
                                       then append the URL to Config B.1 CorsOrigins
                                       and re-run this script to refresh CORS.
   4. GitHub repo secrets           : paste the AZURE_* values printed by Phase 9.

"@ -ForegroundColor Green

Write-Host "Deployment completed: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan

# ── Empty app settings check ─────────────────────────────────────
$liveJson = az functionapp config appsettings list `
    --name           $envCfg.FunctionApp `
    --resource-group $envCfg.ResourceGroup `
    --output         json 2>$null

$emptyKeys = @(if ($liveJson) {
        ($liveJson | ConvertFrom-Json) |
            Where-Object { [string]::IsNullOrEmpty($_.value) } |
            Select-Object -ExpandProperty name |
            Sort-Object
    })

if ($emptyKeys.Count -gt 0) {
    Write-Host ''
    Write-Host "  ⚠  $($emptyKeys.Count) app setting(s) with empty values - operator action required:" -ForegroundColor Yellow
    foreach ($key in $emptyKeys) { Write-Host "       • $key" -ForegroundColor Yellow }
    Write-Host ''
} else {
    Write-Host ''
    Write-Host "  ✓ All app settings have values." -ForegroundColor Green
    Write-Host ''
}
