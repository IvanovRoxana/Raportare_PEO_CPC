param(
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$DataDir = ".\data\import"
)

$ErrorActionPreference = "Stop"

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
    throw "Nu am gasit tabel DynamoDB pentru modelul $ModelName."
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

  return $item
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

    $tempFile = Join-Path $env:TEMP "peo-dynamodb-batch-$([Guid]::NewGuid().ToString()).json"
    $requestItems | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tempFile -Encoding UTF8

    & $aws dynamodb batch-write-item `
      --request-items "file://$tempFile" `
      --profile $Profile `
      --region $Region `
      --output json | Out-Null

    Remove-Item -LiteralPath $tempFile -Force
    $index += 25
    Write-Host "Importate $([Math]::Min($index, $Items.Count)) / $($Items.Count) in $TableName"
  }
}

$awsExe = Get-AwsExe
$tableResponse = & $awsExe dynamodb list-tables --profile $Profile --region $Region --output json | ConvertFrom-Json
$activityCatalogTable = Find-TableName -TableNames $tableResponse.TableNames -ModelName "ActivityCatalog"
$workingGroupTable = Find-TableName -TableNames $tableResponse.TableNames -ModelName "WorkingGroup"

$catalogPath = Join-Path $DataDir "activity-catalog.json"
$workingGroupsPath = Join-Path $DataDir "working-groups.json"

if (!(Test-Path $catalogPath) -or !(Test-Path $workingGroupsPath)) {
  throw "Ruleaza mai intai: npm run prepare:reference-data"
}

$catalog = Get-Content -Raw -LiteralPath $catalogPath | ConvertFrom-Json
$workingGroups = Get-Content -Raw -LiteralPath $workingGroupsPath | ConvertFrom-Json

Write-Host "Import ActivityCatalog -> $activityCatalogTable"
Write-DdbItems -TableName $activityCatalogTable -Items @($catalog)

Write-Host "Import WorkingGroup -> $workingGroupTable"
Write-DdbItems -TableName $workingGroupTable -Items @($workingGroups)

Write-Host "Import finalizat pentru cataloagele stabile. Datele operationale raman pregatite in data/import pentru maparea expertilor."
