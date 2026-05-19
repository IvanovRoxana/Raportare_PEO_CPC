param(
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$TableName = "Expert-nkgoctpfhrfmnjm3bwbvnbnw5e-NONE",
  [string]$DataFile = "$PSScriptRoot\..\data\import\experts.json",
  [switch]$ApplyAccessSensitiveRoleUpdates
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

function ConvertFrom-DdbAttribute {
  param($Attribute)

  if ($null -eq $Attribute) {
    return $null
  }
  if ($Attribute.S -ne $null) {
    return [string]$Attribute.S
  }
  if ($Attribute.N -ne $null) {
    $numberText = [string]$Attribute.N
    if ($numberText -match "^-?\d+$") {
      return [int]$numberText
    }
    return [double]$numberText
  }
  if ($Attribute.BOOL -ne $null) {
    return [bool]$Attribute.BOOL
  }
  if ($Attribute.L -ne $null) {
    return @($Attribute.L | ForEach-Object { ConvertFrom-DdbAttribute $_ })
  }

  return $null
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

function ConvertTo-ExpertItem {
  param(
    $Object,
    [string]$Timestamp
  )

  $fields = @(
    "id",
    "name",
    "role",
    "email",
    "phone",
    "category",
    "norma",
    "normType",
    "oreZi",
    "manualMonthlyNorm",
    "projectMonthlyNorm",
    "positionInProject",
    "projectCode",
    "projectTitle",
    "saCodes",
    "hasPmAccess",
    "isActive"
  )

  $item = @{
    createdAt = @{ S = $Timestamp }
    updatedAt = @{ S = $Timestamp }
  }

  foreach ($field in $fields) {
    if ($Object.PSObject.Properties.Name -contains $field) {
      $attribute = ConvertTo-DdbAttribute $Object.$field
      if ($null -ne $attribute) {
        $item[$field] = $attribute
      }
    }
  }

  return $item
}

function ConvertFrom-DdbItem {
  param($Item)

  $object = @{}
  foreach ($property in $Item.PSObject.Properties) {
    $object[$property.Name] = ConvertFrom-DdbAttribute $property.Value
  }
  return [pscustomobject]$object
}

function Invoke-AwsJson {
  param(
    [array]$Arguments,
    $InputObject
  )

  $aws = Get-AwsExe
  $tempFile = Join-Path $env:TEMP "peo-aws-$([Guid]::NewGuid().ToString()).json"
  try {
    [System.IO.File]::WriteAllText($tempFile, (ConvertTo-Json -InputObject $InputObject -Depth 30), [System.Text.UTF8Encoding]::new($false))
    & $aws @Arguments "file://$tempFile" --profile $Profile --region $Region --output json | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Get-Content -LiteralPath $tempFile
      throw "AWS command failed: $($Arguments -join ' ')"
    }
  } finally {
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
  }
}

if (!(Test-Path -LiteralPath $DataFile)) {
  throw "Nu gasesc experts.json la: $DataFile. Ruleaza mai intai: npm run prepare:reference-data"
}

$awsExe = Get-AwsExe
$experts = Get-Content -LiteralPath $DataFile -Raw | ConvertFrom-Json
$scanJson = & $awsExe dynamodb scan --table-name $TableName --profile $Profile --region $Region --output json
if ($LASTEXITCODE -ne 0) {
  throw "Nu pot citi tabela DynamoDB: $TableName"
}

$currentItems = @((($scanJson | ConvertFrom-Json).Items) | ForEach-Object { ConvertFrom-DdbItem $_ })
$currentByEmail = @{}
foreach ($item in $currentItems) {
  if ($item.email) {
    $currentByEmail[$item.email.ToLowerInvariant()] = $item
  }
}

$now = (Get-Date).ToUniversalTime().ToString("o")
$created = 0
$updated = 0
$skippedAccessSensitiveRole = 0

foreach ($expert in $experts) {
  $email = [string]$expert.email
  if ([string]::IsNullOrWhiteSpace($email)) {
    continue
  }

  $current = $currentByEmail[$email.ToLowerInvariant()]
  if ($null -eq $current) {
    $putItem = @{
      TableName = $TableName
      Item = (ConvertTo-ExpertItem -Object $expert -Timestamp $now)
    }
    Invoke-AwsJson -Arguments @("dynamodb", "put-item", "--cli-input-json") -InputObject $putItem
    $created += 1
    continue
  }

  $updates = @{}
  foreach ($field in @("positionInProject", "projectCode", "projectTitle", "saCodes", "category", "norma", "normType", "oreZi", "manualMonthlyNorm", "projectMonthlyNorm", "hasPmAccess", "isActive")) {
    $newValue = $expert.$field
    $oldValue = $current.$field
    if (($newValue | ConvertTo-Json -Compress) -ne ($oldValue | ConvertTo-Json -Compress)) {
      $updates[$field] = $newValue
    }
  }

  if ($expert.role -ne $current.role) {
    if ($ApplyAccessSensitiveRoleUpdates) {
      $updates["role"] = $expert.role
    } else {
      $skippedAccessSensitiveRole += 1
    }
  }

  if ($updates.Count -eq 0) {
    continue
  }

  $setParts = @()
  $attributeNames = @{}
  $attributeValues = @{
    ":updatedAt" = @{ S = $now }
  }
  foreach ($field in $updates.Keys) {
    $nameKey = "#$field"
    $valueKey = ":$field"
    $attributeNames[$nameKey] = $field
    $attributeValues[$valueKey] = ConvertTo-DdbAttribute $updates[$field]
    $setParts += "$nameKey = $valueKey"
  }
  $setParts += "updatedAt = :updatedAt"

  $updateItem = @{
    TableName = $TableName
    Key = @{ id = @{ S = $current.id } }
    UpdateExpression = "SET $($setParts -join ', ')"
    ExpressionAttributeNames = $attributeNames
    ExpressionAttributeValues = $attributeValues
  }

  Invoke-AwsJson -Arguments @("dynamodb", "update-item", "--cli-input-json") -InputObject $updateItem
  $updated += 1
}

Write-Host "Expert import finished."
Write-Host "Created: $created"
Write-Host "Updated: $updated"
Write-Host "Skipped access-sensitive role updates: $skippedAccessSensitiveRole"
