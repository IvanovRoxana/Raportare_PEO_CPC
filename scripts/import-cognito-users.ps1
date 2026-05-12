param(
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$Aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe",
  [string]$OutputsPath = "$PSScriptRoot\..\amplify_outputs.json"
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path -LiteralPath $Aws)) {
  throw "AWS CLI nu a fost gasit la: $Aws"
}

if (-not (Test-Path -LiteralPath $OutputsPath)) {
  throw "Nu gasesc amplify_outputs.json la: $OutputsPath"
}

$outputs = Get-Content -Raw -LiteralPath $OutputsPath | ConvertFrom-Json
$userPoolId = $outputs.auth.user_pool_id

if (-not $userPoolId) {
  throw "Nu gasesc user_pool_id in amplify_outputs.json"
}

$users = @(
  @{ Name = "Andreea Cojocaru"; Email = "andreea.cojocaru@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Bianca Toma"; Email = "bianca.toma@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Alexandru Enache"; Email = "alexandru.enache@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Alexandra Colceru"; Email = "alexandra.colceru@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Gabriel Zvinca"; Email = "gabriel.zvinca@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Irina Nicolae"; Email = "irina.nicolae@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Liviu Neagu"; Email = "liviu.neagu@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Radu Ianos"; Email = "radu.ianos@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Roxana Ivanov"; Email = "roxana.ivanov@confederatia-concordia.ro"; Roles = @("expert", "pm") },
  @{ Name = "Dan Zaharia"; Email = "dan.zaharia@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Simona Khamissi"; Email = "simona.khamissi@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Nida Halit"; Email = "nida.halit@confederatia-concordia.ro"; Roles = @("expert") },
  @{ Name = "Mihaela Grigoras"; Email = "mihaela.grigoras@confederatia-concordia.ro"; Roles = @("pm") }
)

function New-TemporaryPassword {
  $letters = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
  $digits = "23456789"
  $symbols = "!@#$%^&*_-+="
  $pool = ($letters + $digits + $symbols).ToCharArray()
  $chars = New-Object System.Collections.Generic.List[char]

  $chars.Add($letters[(Get-Random -Minimum 0 -Maximum $letters.Length)])
  $chars.Add($letters.ToUpper()[(Get-Random -Minimum 0 -Maximum $letters.Length)])
  $chars.Add($digits[(Get-Random -Minimum 0 -Maximum $digits.Length)])
  $chars.Add($symbols[(Get-Random -Minimum 0 -Maximum $symbols.Length)])

  1..20 | ForEach-Object {
    $chars.Add($pool[(Get-Random -Minimum 0 -Maximum $pool.Length)])
  }

  return -join ($chars | Sort-Object { Get-Random })
}

foreach ($user in $users) {
  $email = $user.Email.ToLowerInvariant()
  $name = $user.Name
  $exists = $true

  & $Aws cognito-idp admin-get-user `
    --user-pool-id $userPoolId `
    --username $email `
    --profile $Profile `
    --region $Region *> $null

  if ($LASTEXITCODE -ne 0) {
    $exists = $false
  }

  if (-not $exists) {
    & $Aws cognito-idp admin-create-user `
      --user-pool-id $userPoolId `
      --username $email `
      --user-attributes "Name=email,Value=$email" "Name=email_verified,Value=true" "Name=name,Value=$name" `
      --message-action SUPPRESS `
      --profile $Profile `
      --region $Region *> $null

    if ($LASTEXITCODE -ne 0) {
      throw "Nu am putut crea utilizatorul $email"
    }
  } else {
    & $Aws cognito-idp admin-update-user-attributes `
      --user-pool-id $userPoolId `
      --username $email `
      --user-attributes "Name=email_verified,Value=true" "Name=name,Value=$name" `
      --profile $Profile `
      --region $Region *> $null
  }

  $password = New-TemporaryPassword
  & $Aws cognito-idp admin-set-user-password `
    --user-pool-id $userPoolId `
    --username $email `
    --password $password `
    --permanent `
    --profile $Profile `
    --region $Region *> $null

  if ($LASTEXITCODE -ne 0) {
    throw "Nu am putut seta parola temporara permanenta pentru $email"
  }

  foreach ($role in $user.Roles) {
    & $Aws cognito-idp admin-add-user-to-group `
      --user-pool-id $userPoolId `
      --username $email `
      --group-name $role `
      --profile $Profile `
      --region $Region *> $null

    if ($LASTEXITCODE -ne 0) {
      throw "Nu am putut adauga $email in grupul $role"
    }
  }

  Write-Host "OK $email -> $($user.Roles -join ', ')"
}

Write-Host "Import finalizat pentru $($users.Count) utilizatori. Emailurile de invitatie au fost suprimate; utilizatorii folosesc fluxul Am uitat parola."
