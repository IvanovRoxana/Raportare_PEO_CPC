$ErrorActionPreference = "Stop"

$ProfileName = "raportarepeo"
$SessionName = "RaportarePEO_CPC"
$StartUrl = "https://d-c367697fc4.awsapps.com/start"
$Region = "eu-north-1"
$AccountId = "147885329053"

Write-Host ""
Write-Host "AWS SSO pentru Raportare PEO" -ForegroundColor Cyan
Write-Host "Profile:     $ProfileName"
Write-Host "Session:     $SessionName"
Write-Host "Start URL:   $StartUrl"
Write-Host "Region:      $Region"
Write-Host "Account ID:  $AccountId"
Write-Host ""

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Host "AWS CLI nu este disponibil in acest PowerShell." -ForegroundColor Red
  Write-Host "Instaleaza AWS CLI v2 sau redeschide PowerShell dupa instalare."
  exit 1
}

Write-Host "Pornesc configurarea SSO cu device code..." -ForegroundColor Yellow
Write-Host "Cand te intreaba, foloseste valorile afisate mai sus." -ForegroundColor Yellow
Write-Host ""

aws configure sso --profile $ProfileName --use-device-code

Write-Host ""
Write-Host "Dupa configurare, rulez verificarea identitatii..." -ForegroundColor Yellow
aws sso login --profile $ProfileName --use-device-code
aws sts get-caller-identity --profile $ProfileName
