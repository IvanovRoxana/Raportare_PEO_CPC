param(
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$Environment = $env:APP_ENV,
  [string]$OutputsPath = ".\.amplify\staging\amplify_outputs.json",
  [string]$ProductionOutputsPath = ".\amplify_outputs.json",
  [string]$AdminEmail = $env:STAGING_ADMIN_EMAIL,
  [string]$FinancialEmail = $env:STAGING_FINANCIAL_EMAIL,
  [string]$PmEmail = $env:STAGING_PM_EMAIL,
  [string]$ExpertEmail = $env:STAGING_EXPERT_EMAIL,
  [string]$TemporaryPassword = $env:STAGING_TEMP_PASSWORD
)

$ErrorActionPreference = "Stop"

function Read-JsonUtf8([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { throw "Fisierul lipseste: $Path" }
  return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path), [Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Get-AwsExe {
  foreach ($candidate in @(
    "C:\Users\RoxanaIvanov\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe",
    "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
  )) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return "aws"
}

if ($Environment -ne "staging") { throw "Crearea utilizatorilor este permisa numai cu APP_ENV=staging." }
if ([string]::IsNullOrWhiteSpace($TemporaryPassword)) { throw "Lipseste STAGING_TEMP_PASSWORD." }

$staging = Read-JsonUtf8 $OutputsPath
$production = Read-JsonUtf8 $ProductionOutputsPath
$userPoolId = [string]$staging.auth.user_pool_id
$productionPoolId = [string]$production.auth.user_pool_id
if (!$userPoolId -or $userPoolId -eq $productionPoolId) {
  throw "Operatie blocata: user pool staging lipseste sau este identic cu productia."
}

$users = @(
  [pscustomobject]@{ label = "Admin"; email = $AdminEmail; group = "admin" },
  [pscustomobject]@{ label = "Financiar"; email = $FinancialEmail; group = "admin" },
  [pscustomobject]@{ label = "PM"; email = $PmEmail; group = "pm" },
  [pscustomobject]@{ label = "Expert"; email = $ExpertEmail; group = "expert" }
)
if (@($users | Where-Object { [string]::IsNullOrWhiteSpace($_.email) }).Count -gt 0) {
  throw "Configureaza toate variabilele STAGING_ADMIN_EMAIL, STAGING_FINANCIAL_EMAIL, STAGING_PM_EMAIL si STAGING_EXPERT_EMAIL."
}

$aws = Get-AwsExe
foreach ($user in $users) {
  & $aws cognito-idp admin-get-user --user-pool-id $userPoolId --username $user.email --profile $Profile --region $Region --output json 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    & $aws cognito-idp admin-create-user --user-pool-id $userPoolId --username $user.email --temporary-password $TemporaryPassword --message-action SUPPRESS --user-attributes "Name=email,Value=$($user.email)" "Name=email_verified,Value=true" --profile $Profile --region $Region --output json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Nu am putut crea utilizatorul $($user.label)." }
  }
  & $aws cognito-idp admin-add-user-to-group --user-pool-id $userPoolId --username $user.email --group-name $user.group --profile $Profile --region $Region
  if ($LASTEXITCODE -ne 0) { throw "Nu am putut atribui grupul $($user.group) pentru $($user.label)." }
  Write-Host "$($user.label): configurat in grupul $($user.group)."
}

Write-Host "Utilizatorii staging au fost creati fara trimitere de email. Parola temporara nu a fost afisata."
