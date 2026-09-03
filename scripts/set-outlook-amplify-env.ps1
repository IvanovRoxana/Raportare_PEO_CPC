param(
  [string]$AppId = "d19mquq8thd1uj",
  [string]$BranchName = "main",
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$RedirectUri = "https://pm.concordia.ro/api/outlook/callback"
)

$ErrorActionPreference = "Stop"

function Read-RequiredValue([string]$Label, [string]$DefaultValue = "") {
  if ($DefaultValue) {
    $value = Read-Host "$Label [$DefaultValue]"
    if ([string]::IsNullOrWhiteSpace($value)) {
      return $DefaultValue
    }
    return $value.Trim()
  }

  $value = Read-Host $Label
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Label este obligatoriu."
  }
  return $value.Trim()
}

function Convert-SecureStringToPlainText([securestring]$SecureValue) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Read-SecretValue([string]$Label, [bool]$Required = $true) {
  $secure = Read-Host $Label -AsSecureString
  $plain = Convert-SecureStringToPlainText $secure
  if ([string]::IsNullOrWhiteSpace($plain)) {
    if ($Required) {
      throw "$Label este obligatoriu."
    }
    return ""
  }
  return $plain.Trim()
}

function New-TokenEncryptionKey {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes)
}

$clientId = Read-RequiredValue "OUTLOOK_CLIENT_ID din Microsoft Entra"
$tenantId = Read-RequiredValue "OUTLOOK_TENANT_ID" "459cc33f-ec96-4318-9269-8b1370a2ff58"
$clientSecret = Read-SecretValue "OUTLOOK_CLIENT_SECRET din Microsoft Entra"
$tokenEncryptionKey = Read-SecretValue "OUTLOOK_TOKEN_ENCRYPTION_KEY (Enter daca vrei sa folosesti una generata)" $false

if ([string]::IsNullOrWhiteSpace($tokenEncryptionKey)) {
  $tokenEncryptionKey = New-TokenEncryptionKey
}

$branch = aws amplify get-branch `
  --app-id $AppId `
  --branch-name $BranchName `
  --profile $Profile `
  --region $Region `
  --output json | ConvertFrom-Json

$environment = @{}
$branch.branch.environmentVariables.PSObject.Properties | ForEach-Object {
  $environment[$_.Name] = [string]$_.Value
}

$environment["OUTLOOK_CLIENT_ID"] = $clientId
$environment["OUTLOOK_CLIENT_SECRET"] = $clientSecret
$environment["OUTLOOK_TENANT_ID"] = $tenantId
$environment["OUTLOOK_REDIRECT_URI"] = $RedirectUri
$environment["OUTLOOK_TOKEN_ENCRYPTION_KEY"] = $tokenEncryptionKey

$payload = @{
  appId = $AppId
  branchName = $BranchName
  environmentVariables = $environment
} | ConvertTo-Json -Depth 5 -Compress

$payloadPath = Join-Path ([System.IO.Path]::GetTempPath()) "amplify-outlook-env.json"
$payload | Set-Content -LiteralPath $payloadPath -Encoding UTF8

aws amplify update-branch `
  --profile $Profile `
  --region $Region `
  --cli-input-json "file://$payloadPath" `
  --query "branch.{branchName:branchName,stage:stage,envKeys:keys(environmentVariables)}" `
  --output json

Remove-Item -LiteralPath $payloadPath -Force

Write-Host ""
Write-Host "Variabilele Outlook au fost setate pe Amplify branch $BranchName. Nu au fost afisate valori secrete."
