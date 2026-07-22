param(
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$AppId = "d19mquq8thd1uj",
  [string]$BranchName = "staging",
  [string]$Environment = $env:APP_ENV,
  [string]$OutputsPath = ".\.amplify\staging\amplify_outputs.json",
  [string]$ProductionOutputsPath = ".\amplify_outputs.json",
  [string]$DataPath = ".\data\staging\seed.json",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-AwsExe {
  foreach ($candidate in @(
    "C:\Users\RoxanaIvanov\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe",
    "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
  )) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return "aws"
}

function Read-JsonUtf8([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { throw "Fisierul lipseste: $Path" }
  return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path), [Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Get-SeedId([string]$Value) {
  $text = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = [Text.StringBuilder]::new()
  foreach ($character in $text.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($character)
    }
  }
  return ($builder.ToString().ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
}

function Get-DailyNorm([string]$Label) {
  if ($Label -match "(\d+)\s*h/zi") { return [int]$Matches[1] }
  return 8
}

function Get-Workdays([int]$Year, [int]$Month) {
  $result = @()
  $date = Get-Date -Year $Year -Month $Month -Day 1
  while ($date.Month -eq $Month) {
    if ($date.DayOfWeek -notin @([DayOfWeek]::Saturday, [DayOfWeek]::Sunday)) {
      $result += $date.ToString("yyyy-MM-dd")
    }
    $date = $date.AddDays(1)
  }
  return $result
}

function Expand-Hours([double]$Total, [double]$Limit, [array]$Dates, [bool]$Reverse = $false) {
  if ($Total -le 0) { return @() }
  $remaining = $Total
  $orderedDates = if ($Reverse) { @($Dates | Sort-Object -Descending) } else { @($Dates) }
  $result = @()
  for ($index = 0; $remaining -gt 0; $index++) {
    if ($index -ge $orderedDates.Count) { throw "Orele $Total depasesc capacitatea lunii." }
    $hours = [Math]::Min($Limit, $remaining)
    $result += [pscustomobject]@{ date = $orderedDates[$index]; hours = $hours }
    $remaining -= $hours
  }
  return $result
}

function ConvertTo-DdbAttribute($Value) {
  if ($null -eq $Value) { return $null }
  if ($Value -is [bool]) { return @{ BOOL = $Value } }
  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
    return @{ N = ([string]$Value).Replace(",", ".") }
  }
  if ($Value -is [array]) { return @{ L = @($Value | ForEach-Object { ConvertTo-DdbAttribute $_ }) } }
  $text = "$Value"
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  return @{ S = $text }
}

function ConvertTo-DdbItem($Object) {
  $now = (Get-Date).ToUniversalTime().ToString("o")
  $item = @{ createdAt = @{ S = $now }; updatedAt = @{ S = $now } }
  foreach ($property in $Object.PSObject.Properties) {
    $attribute = ConvertTo-DdbAttribute $property.Value
    if ($null -ne $attribute) { $item[$property.Name] = $attribute }
  }
  return $item
}

function Write-DdbItems([string]$TableName, [array]$Items, [string]$AwsExe) {
  if ($Items.Count -eq 0) { return }
  if ($DryRun) {
    Write-Host "[DRY-RUN] $TableName <- $($Items.Count)"
    return
  }
  for ($index = 0; $index -lt $Items.Count; $index += 25) {
    $last = [Math]::Min($index + 24, $Items.Count - 1)
    $request = @{ $TableName = @($Items[$index..$last] | ForEach-Object { @{ PutRequest = @{ Item = ConvertTo-DdbItem $_ } } }) }
    $tempFile = Join-Path $env:TEMP "peo-staging-$([Guid]::NewGuid()).json"
    try {
      [IO.File]::WriteAllText($tempFile, ($request | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
      & $AwsExe dynamodb batch-write-item --request-items "file://$tempFile" --profile $Profile --region $Region --output json | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Scrierea in $TableName a esuat." }
    } finally {
      Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Host "$TableName <- $($Items.Count)"
}

function Get-DdbTableTags([string]$TableName, [string]$AwsExe) {
  $arn = & $AwsExe dynamodb describe-table --table-name $TableName --profile $Profile --region $Region --query "Table.TableArn" --output text
  if ($LASTEXITCODE -ne 0 -or !$arn) { throw "Nu pot citi ARN-ul tabelului $TableName." }
  $response = & $AwsExe dynamodb list-tags-of-resource --resource-arn $arn --profile $Profile --region $Region --output json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw "Nu pot citi tag-urile tabelului $TableName." }
  $tags = @{}
  foreach ($tag in @($response.Tags)) { $tags[[string]$tag.Key] = [string]$tag.Value }
  return $tags
}

if ($Environment -ne "staging") { throw "Seed blocat: Environment trebuie sa fie exact staging." }
$stagingOutputs = Read-JsonUtf8 $OutputsPath
$productionOutputs = Read-JsonUtf8 $ProductionOutputsPath
$stagingUrl = [string]$stagingOutputs.data.url
$productionUrl = [string]$productionOutputs.data.url
if (!$stagingUrl -or $stagingUrl -eq $productionUrl) { throw "Seed blocat: endpoint staging lipsa sau identic cu productia." }

$aws = Get-AwsExe
$apis = & $aws appsync list-graphql-apis --profile $Profile --region $Region --output json | ConvertFrom-Json
$api = @($apis.graphqlApis | Where-Object { $_.uris.GRAPHQL -eq $stagingUrl })
if ($api.Count -ne 1) { throw "API-ul AppSync staging nu poate fi identificat unic." }
$apiId = [string]$api[0].apiId
if ($productionUrl -match [regex]::Escape($apiId)) { throw "Seed blocat: API ID staging apare in productia cunoscuta." }

$tableNames = (& $aws dynamodb list-tables --profile $Profile --region $Region --output json | ConvertFrom-Json).TableNames
$tables = @{}
foreach ($model in @("Expert", "Activity", "ConcurrentProject", "ConcurrentProjectTimesheetEntry")) {
  $matches = @()
  foreach ($candidate in @($tableNames | Where-Object { $_ -like "$model-*-NONE" })) {
    $tags = Get-DdbTableTags $candidate $aws
    if (
      $tags["amplify:app-id"] -eq $AppId -and
      $tags["amplify:branch-name"] -eq $BranchName -and
      $tags["amplify:deployment-type"] -eq "branch"
    ) {
      $matches += $candidate
    }
  }
  if ($matches.Count -ne 1) { throw "Tabelul staging pentru $model nu poate fi identificat unic dupa tag-uri." }
  $tables[$model] = $matches[0]
}

$seed = Read-JsonUtf8 $DataPath
if (@($seed.people).Count -ne 25) { throw "Seed invalid: sunt necesare exact 25 de persoane." }
$workdays = Get-Workdays $seed.year $seed.month
$experts = @()
$activities = @()
$projects = @()
$entries = @()

foreach ($person in $seed.people) {
  $slug = Get-SeedId $person.name
  $expertId = "staging-expert-$slug"
  $dailyNorm = Get-DailyNorm $person.peoNorm
  $normType = if ($person.peoNorm -match "h/luna") { "project" } elseif ($person.peoNorm -eq "-") { "staging_excel_missing" } else { "calculated" }
  $monthlyNorm = if ($person.peoNorm -match "(\d+)\s*h/luna") { [double]$Matches[1] } else { $null }
  $experts += [pscustomobject][ordered]@{
    id = $expertId; name = $person.name; role = "Expert"; category = "ap"
    norma = $dailyNorm; normType = $normType; oreZi = $dailyNorm; dailyHours = $dailyNorm
    projectMonthlyNorm = $monthlyNorm
    positionInProject = if ($person.peoPosition -eq "-") { "" } else { $person.peoPosition }
    projectCode = if ($person.peoPosition -eq "-") { "" } else { "302141" }
    projectTitle = "PEO 302141 - TEST"; contractType = $person.cimNorm
    jobDescriptionText = $person.basePosition; beneficiary = "Confederatia Patronala Concordia"
    isActive = $true
  }

  $peoRows = @(Expand-Hours ([double]$person.peoWorked) $dailyNorm $workdays)
  for ($index = 0; $index -lt $peoRows.Count; $index++) {
    $status = if ($index % 11 -eq 10) { "draft" } elseif ($index % 7 -eq 6) { "sent" } else { "approved" }
    $activities += [pscustomobject][ordered]@{
      id = "staging-activity-$slug-work-$('{0:d2}' -f ($index + 1))"
      date = $peoRows[$index].date; expertId = $expertId; expertName = $person.name
      year = [int]$seed.year; month = [int]$seed.month
      hours = $peoRows[$index].hours; activityType = "Activitate PEO (TEST)"; saCode = "SA3.2"
      title = "Activitate sintetica"; description = "Date controlate staging."
      location = "Online"; dayType = "lucratoare"; status = $status; projectCode = "302141"
    }
  }
  $leaveRows = @(Expand-Hours ([double]$person.peoLeave) $dailyNorm $workdays $true)
  for ($index = 0; $index -lt $leaveRows.Count; $index++) {
    $activities += [pscustomobject][ordered]@{
      id = "staging-activity-$slug-leave-$('{0:d2}' -f ($index + 1))"
      date = $leaveRows[$index].date; expertId = $expertId; expertName = $person.name
      year = [int]$seed.year; month = [int]$seed.month
      hours = $leaveRows[$index].hours; activityType = "CO - Concediu odihna (TEST)"
      title = "Concediu odihna"; description = "Concediu sintetic staging."
      location = "N/A"; dayType = "CO"; status = "approved"; projectCode = "302141"
    }
  }

  $specs = @(
    [pscustomobject]@{ key = "concordia"; name = "Activitate curenta Concordia (TEST)"; code = "CONCORDIA-TEST"; role = $person.basePosition; worked = [double]$person.concordiaWorked; leave = [double]$person.concordiaLeave },
    [pscustomobject]@{ key = "goodworks"; name = "GOODWORKS4ALL (TEST)"; code = "GOODWORKS4ALL-TEST"; role = $person.goodworksPosition; worked = [double]$person.goodworksWorked; leave = 0 }
  )
  foreach ($spec in $specs) {
    if (($spec.worked + $spec.leave) -le 0) { continue }
    $projectId = "staging-project-$slug-$($spec.key)"
    $projects += [pscustomobject][ordered]@{
      id = $projectId; expertId = $expertId; expertName = $person.name
      projectName = $spec.name; projectCode = $spec.code; expertProjectRole = $spec.role
      fundingSource = "Date controlate staging"; dailyHours = 8
      startDate = "$($seed.year)-$('{0:d2}' -f $seed.month)-01"
      endDate = "$($seed.year)-$('{0:d2}' -f $seed.month)-30"
      isActive = $true; status = "validated"; assignmentSource = "import"
      expertFunction = $spec.role; notes = "TEST - template control."
    }
    $workedRows = @(Expand-Hours $spec.worked 8 $workdays)
    $leaveProjectRows = @(Expand-Hours $spec.leave 8 $workdays $true)
    $counter = 0
    foreach ($row in @($workedRows + $leaveProjectRows)) {
      $counter += 1
      $isLeave = $counter -gt $workedRows.Count
      $entries += [pscustomobject][ordered]@{
        id = "staging-entry-$slug-$($spec.key)-$('{0:d2}' -f $counter)"
        concurrentProjectId = $projectId; expertId = $expertId; date = $row.date
        month = [int]$seed.month; year = [int]$seed.year; hours = $row.hours
        taskName = if ($isLeave) { "CO sintetic (TEST)" } else { "Activitate sintetica (TEST)" }
        dayType = if ($isLeave) { "CO" } else { "lucratoare" }
        notes = "Date controlate staging."; status = "verified"; source = "import"
        createdBy = "staging-seed"; updatedBy = "staging-seed"
      }
    }
  }
}

$simona = $experts | Where-Object { $_.name -eq "Simona Khamissi" }
$activities += [pscustomobject][ordered]@{
  id = "staging-activity-simona-khamissi-duplicate-leave"; date = "$($seed.year)-$('{0:d2}' -f $seed.month)-30"
  year = [int]$seed.year; month = [int]$seed.month
  expertId = $simona.id; expertName = $simona.name; hours = 0
  activityType = "CO duplicat intentionat (TEST)"; title = "Conflict concediu"
  description = "Duplicat intentionat pentru verificarea alertelor."; location = "N/A"
  dayType = "CO"; status = "draft"; projectCode = "302141"
}

Write-Host "API staging verificat: $apiId"
Write-Host "Pregatit: $($experts.Count) experti, $($activities.Count) activitati, $($projects.Count) proiecte, $($entries.Count) pontaje concurente."
Write-DdbItems $tables.Expert $experts $aws
Write-DdbItems $tables.Activity $activities $aws
Write-DdbItems $tables.ConcurrentProject $projects $aws
Write-DdbItems $tables.ConcurrentProjectTimesheetEntry $entries $aws
Write-Host "Seed staging finalizat; productia nu a fost accesata pentru scriere."
