# ==============================================================================
# Azure-Connectivity.ps1  (PhotoSheet-Maker)
#
# Reusable entry point for every mutating infra script under
# `C:\repos\PhotoSheet-Maker\infra`. Authenticates BOTH Az PowerShell and the
# `az` CLI against the same service principal using a certificate (no client
# secret ever lands in env vars). Wipes any stale sessions and cert caches
# from previous runs so post-rotation certs actually take effect.
#
# Required environment variables (set once, machine-wide):
#     MY_APPREG_CLIENT_ID          App registration (client) ID
#     MY_APPREG_TENANT_ID          Directory (tenant) ID
#     MY_APPREG_CERT_THUMBPRINT    Thumbprint of the SP cert in
#                                  Cert:\CurrentUser\My or LocalMachine\My
#
# Optional:
#     MY_APPREG_CERT_PATH          Path to a PEM file (cert + private key).
#                                  If set, skips the cert-store lookup and
#                                  private-key export step below.
#
# The service principal needs at minimum on the subscription:
#     Contributor
#     Key Vault Administrator (until RBAC-mode KV is provisioned)
#     User Access Administrator (to grant runtime RBAC in later phases)
# ==============================================================================

$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------------
# Validate required environment variables
# ------------------------------------------------------------------

foreach ($var in @(
        'MY_APPREG_CLIENT_ID',
        'MY_APPREG_CERT_THUMBPRINT',
        'MY_APPREG_TENANT_ID'
    )) {

    # Resolve from Process scope first, then User scope. Always mirror the
    # value back into Process scope so downstream tooling (az CLI, Az PS,
    # dotnet SDK, etc.) sees the same value regardless of how it was set.
    $value = [Environment]::GetEnvironmentVariable($var, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($var, 'User')
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required environment variable: $var  (set it with: [Environment]::SetEnvironmentVariable('$var', '<value>', 'User'))"
    }
    [Environment]::SetEnvironmentVariable($var, $value, 'Process')
}


# ------------------------------------------------------------------
# Validate Azure PowerShell module
# ------------------------------------------------------------------

$azAccountsModule = Get-Module -ListAvailable -Name Az.Accounts |
    Sort-Object Version -Descending |
    Select-Object -First 1

if (-not $azAccountsModule) {
    throw "Azure PowerShell module 'Az.Accounts' is not installed. Run: Install-Module Az -Scope CurrentUser"
}

Import-Module Az.Accounts -Force

# ------------------------------------------------------------------
# Validate Azure CLI
# ------------------------------------------------------------------

$azCli = Get-Command az -ErrorAction SilentlyContinue

if (-not $azCli) {
    throw "Azure CLI (az) is not installed or not found in PATH. See https://aka.ms/installazurecli"
}

# ------------------------------------------------------------------
# Clear Azure PowerShell sessions
# ------------------------------------------------------------------

Write-Host "Clearing Azure PowerShell sessions..."

Disconnect-AzAccount -Scope Process -ErrorAction SilentlyContinue | Out-Null
Disconnect-AzAccount -Scope CurrentUser -ErrorAction SilentlyContinue | Out-Null

Clear-AzContext -Scope Process -Force -ErrorAction SilentlyContinue
Clear-AzContext -Scope CurrentUser -Force -ErrorAction SilentlyContinue

# ------------------------------------------------------------------
# Clear Azure CLI sessions
# ------------------------------------------------------------------

Write-Host "Clearing Azure CLI sessions..."

az logout --only-show-errors 2>$null
az account clear 2>$null
# Wipe the binary credential/token caches so no stale PEM path or refresh
# token survives across logins. These files are safe to delete - az login
# re-creates them.
Remove-Item "$env:USERPROFILE\.azure\service_principal_entries.bin" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\.azure\msal_token_cache.bin" -Force -ErrorAction SilentlyContinue

# ------------------------------------------------------------------
# Authenticate Azure PowerShell (certificate flow)
# ------------------------------------------------------------------

Write-Host "Authenticating Azure PowerShell..."

$azContext = Connect-AzAccount `
    -ServicePrincipal `
    -Tenant              $env:MY_APPREG_TENANT_ID `
    -ApplicationId       $env:MY_APPREG_CLIENT_ID `
    -CertificateThumbprint $env:MY_APPREG_CERT_THUMBPRINT

# ------------------------------------------------------------------
# Resolve certificate for Azure CLI (--certificate expects a PEM file
# containing both the certificate and the private key)
# ------------------------------------------------------------------

function Get-CertificateByThumbprint {
    param(
        [Parameter(Mandatory)] [string]$Thumbprint
    )

    $normalized = ($Thumbprint -replace '\s', '').ToUpperInvariant()
    $cert = Get-ChildItem -Path Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
        Where-Object { $_.Thumbprint -eq $normalized } |
        Select-Object -First 1

    if (-not $cert) {
        $cert = Get-ChildItem -Path Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
            Where-Object { $_.Thumbprint -eq $normalized } |
            Select-Object -First 1
    }

    return $cert
}

function Convert-CertificateToPemFile {
    param(
        [Parameter(Mandatory)] [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate
    )

    if (-not $Certificate.HasPrivateKey) {
        throw "Certificate '$($Certificate.Thumbprint)' does not include a private key. Azure CLI SP login requires cert + private key PEM."
    }

    $rsaKey = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($Certificate)
    $ecdsaKey = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPrivateKey($Certificate)

    $privateKeyPem = $null
    if ($rsaKey) {
        try {
            $privateKeyPem = $rsaKey.ExportPkcs8PrivateKeyPem()
        } catch {
            throw "Private key export is blocked for thumbprint '$($Certificate.Thumbprint)'. Set MY_APPREG_CERT_PATH to a PEM file that contains both private key and certificate for Azure CLI login."
        }
    } elseif ($ecdsaKey) {
        try {
            $privateKeyPem = $ecdsaKey.ExportPkcs8PrivateKeyPem()
        } catch {
            throw "Private key export is blocked for thumbprint '$($Certificate.Thumbprint)'. Set MY_APPREG_CERT_PATH to a PEM file that contains both private key and certificate for Azure CLI login."
        }
    } else {
        throw "Unsupported certificate key type for thumbprint '$($Certificate.Thumbprint)'. Only RSA/ECDSA keys are supported."
    }

    $certPem = $null
    $exportCertPemMethod = $Certificate.GetType().GetMethod('ExportCertificatePem', [Type[]]@())
    if ($exportCertPemMethod) {
        $certPem = $Certificate.ExportCertificatePem()
    } else {
        $base64 = [Convert]::ToBase64String($Certificate.RawData)
        $wrapped = ($base64 -split '(.{1,64})' | Where-Object { $_ -and $_.Length -gt 0 }) -join [Environment]::NewLine
        $certPem = "-----BEGIN CERTIFICATE-----$([Environment]::NewLine)$wrapped$([Environment]::NewLine)-----END CERTIFICATE-----"
    }

    $pemPath = Join-Path ([System.IO.Path]::GetTempPath()) ("az-sp-cert-$($Certificate.Thumbprint.ToLowerInvariant()).pem")

    $pemContent = @(
        $privateKeyPem.TrimEnd()
        ''
        $certPem.TrimEnd()
    ) -join [Environment]::NewLine

    [System.IO.File]::WriteAllText($pemPath, $pemContent, [System.Text.UTF8Encoding]::new($false))
    return $pemPath
}

# ------------------------------------------------------------------
# Authenticate Azure CLI
# ------------------------------------------------------------------

Write-Host "Authenticating Azure CLI..."

$azCertificatePemPath = $null
$configuredPemPath = [System.Environment]::GetEnvironmentVariable('MY_APPREG_CERT_PATH')
if (-not [string]::IsNullOrWhiteSpace($configuredPemPath)) {
    if (-not (Test-Path -LiteralPath $configuredPemPath)) {
        throw "MY_APPREG_CERT_PATH is set but file does not exist: $configuredPemPath"
    }
    $azCertificatePemPath = $configuredPemPath
} else {
    $spCertificate = Get-CertificateByThumbprint -Thumbprint $env:MY_APPREG_CERT_THUMBPRINT
    if (-not $spCertificate) {
        throw "Certificate with thumbprint '$($env:MY_APPREG_CERT_THUMBPRINT)' not found in Cert:\CurrentUser\My or Cert:\LocalMachine\My. Set MY_APPREG_CERT_PATH to a PEM file as fallback."
    }
    $azCertificatePemPath = Convert-CertificateToPemFile -Certificate $spCertificate
}

az login `
    --service-principal `
    --username    $env:MY_APPREG_CLIENT_ID `
    --tenant      $env:MY_APPREG_TENANT_ID `
    --certificate $azCertificatePemPath `
    --only-show-errors | Out-Null

# Force the CLI to enumerate + cache the subscription list. After a fresh
# login where the token caches were wiped, `az account set --subscription`
# fails with "doesn't exist" unless the list is populated first.
az account list --output none --only-show-errors 2>$null

# Expose the PEM path in process scope so subsequent az CLI calls in this
# session can resolve the credential. The file must remain on disk for the
# lifetime of the process.
[Environment]::SetEnvironmentVariable('MY_APPREG_CERT_PATH', $azCertificatePemPath, 'Process')

# ------------------------------------------------------------------
# Verify both channels authenticated
# ------------------------------------------------------------------

$currentAzContext = Get-AzContext

if (-not $currentAzContext) {
    throw "Azure PowerShell authentication verification failed."
}

$cliAccount = az account show --output json 2>$null | ConvertFrom-Json

if (-not $cliAccount) {
    throw "Azure CLI authentication verification failed."
}

Write-Host ""
Write-Host "Azure authentication successful." -ForegroundColor Green
Write-Host "PowerShell Account : $($currentAzContext.Account.Id)"
Write-Host "PowerShell Tenant  : $($currentAzContext.Tenant.Id)"
Write-Host "CLI Tenant         : $($cliAccount.tenantId)"
Write-Host ""
