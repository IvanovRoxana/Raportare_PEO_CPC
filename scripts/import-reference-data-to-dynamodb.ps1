param(
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$DataDir = ".\data\import"
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

    $tempFile = Join-Path $env:TEMP "peo-dynamodb-batch-$([Guid]::NewGuid().ToString()).json"
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

$awsExe = Get-AwsExe
$tableResponse = & $awsExe dynamodb list-tables --profile $Profile --region $Region --output json | ConvertFrom-Json
$activityCatalogTable = Find-TableName -TableNames $tableResponse.TableNames -ModelName "ActivityCatalog"
$expertTable = Find-TableName -TableNames $tableResponse.TableNames -ModelName "Expert"
$workingGroupTable = Find-TableName -TableNames $tableResponse.TableNames -ModelName "WorkingGroup"

$catalogPath = Join-Path $DataDir "activity-catalog.json"
$expertsPath = Join-Path $DataDir "experts.json"
$workingGroupsPath = Join-Path $DataDir "working-groups.json"

if (!(Test-Path $catalogPath) -or !(Test-Path $expertsPath) -or !(Test-Path $workingGroupsPath)) {
  throw "Ruleaza mai intai: npm run prepare:reference-data"
}

$catalog = Read-JsonUtf8 -Path $catalogPath
$experts = Read-JsonUtf8 -Path $expertsPath
$workingGroups = Read-JsonUtf8 -Path $workingGroupsPath

Write-Host "Import Expert -> $expertTable"
Write-DdbItems -TableName $expertTable -Items @($experts)

Write-Host "Import ActivityCatalog -> $activityCatalogTable"
Write-DdbItems -TableName $activityCatalogTable -Items @($catalog)

Write-Host "Import WorkingGroup -> $workingGroupTable"
Write-DdbItems -TableName $workingGroupTable -Items @($workingGroups)

Write-Host "Import finalizat pentru cataloagele stabile. Datele operationale raman pregatite in data/import pentru maparea expertilor."
