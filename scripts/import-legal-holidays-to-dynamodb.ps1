param(
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$DataFile = ".\data\reference\legal-holidays-ro-2026.json"
)

$ErrorActionPreference = "Stop"

$proxyVariables = @("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy")
foreach ($variable in $proxyVariables) {
  Remove-Item "Env:\$variable" -ErrorAction SilentlyContinue
}
$env:NO_PROXY = "*"

function Get-AwsExe {
  $aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
  if (Test-Path $aws) {
    return $aws
  }

  return "aws"
}

function Find-TableName {
  param(
    [array]$TableNames,
    [string]$ModelName
  )

  $matches = @($TableNames | Where-Object { $_ -like "*$ModelName*" })
  if ($matches.Count -eq 0) {
    throw "Nu am gasit tabel DynamoDB pentru modelul $ModelName. Ruleaza deploy dupa adaugarea modelului LegalHoliday."
  }
  if ($matches.Count -gt 1) {
    Write-Host "Am gasit mai multe tabele pentru $ModelName, folosesc primul:" -ForegroundColor Yellow
    $matches | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
  }

  return $matches[0]
}

function ConvertTo-DdbAttribute {
  param($Value)

  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [bool]) {
    return @{ BOOL = $Value }
  }

  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
    return @{ N = "$Value" }
  }

  if ($Value -is [array]) {
    $items = @($Value | ForEach-Object { ConvertTo-DdbAttribute $_ } | Where-Object { $null -ne $_ })
    return @{ L = $items }
  }

  $text = "$Value"
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $null
  }

  return @{ S = $text }
}

function ConvertTo-DdbItem {
  param($Object)

  $now = (Get-Date).ToUniversalTime().ToString("o")
  $item = @{
    createdAt = @{ S = $now }
    updatedAt = @{ S = $now }
  }

  foreach ($property in $Object.PSObject.Properties) {
    $attribute = ConvertTo-DdbAttribute $property.Value
    if ($null -ne $attribute) {
      $item[$property.Name] = $attribute
    }
  }

  if (-not $item.ContainsKey("isActive")) {
    $item["isActive"] = @{ BOOL = $true }
  }

  return $item
}

function Read-JsonUtf8 {
  param([string]$Path)

  return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Write-DdbItems {
  param(
    [string]$TableName,
    [array]$Items
  )

  if ($Items.Count -eq 0) {
    Write-Host "Nu exista elemente pentru $TableName."
    return
  }

  $aws = Get-AwsExe
  $index = 0
  while ($index -lt $Items.Count) {
    $chunk = @($Items[$index..([Math]::Min($index + 24, $Items.Count - 1))])
    $requestItems = @{
      $TableName = @($chunk | ForEach-Object {
        @{
          PutRequest = @{
            Item = ConvertTo-DdbItem $_
          }
        }
      })
    }

    $tempFile = Join-Path $env:TEMP "peo-legal-holidays-dynamodb-batch-$([Guid]::NewGuid().ToString()).json"
    $json = $requestItems | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($tempFile, $json, [System.Text.UTF8Encoding]::new($false))

    & $aws dynamodb batch-write-item `
      --request-items "file://$tempFile" `
      --profile $Profile `
      --region $Region `
      --output json | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "AWS DynamoDB batch-write-item a esuat pentru $TableName."
    }

    Remove-Item -LiteralPath $tempFile -Force
    $index += 25
    Write-Host "Importate $([Math]::Min($index, $Items.Count)) / $($Items.Count) in $TableName"
  }
}

if (!(Test-Path $DataFile)) {
  throw "Nu gasesc fisierul de sarbatori legale: $DataFile"
}

$holidays = @(Read-JsonUtf8 -Path $DataFile)
$awsExe = Get-AwsExe
$tableResponse = & $awsExe dynamodb list-tables --profile $Profile --region $Region --output json | ConvertFrom-Json
$legalHolidayTable = Find-TableName -TableNames $tableResponse.TableNames -ModelName "LegalHoliday"

Write-Host "Import LegalHoliday -> $legalHolidayTable"
Write-DdbItems -TableName $legalHolidayTable -Items $holidays

Write-Host "Import finalizat pentru sarbatorile legale Romania 2026."
