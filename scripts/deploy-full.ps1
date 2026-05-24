param(
  [string]$CommitMessage = "",
  [string]$Profile = "raportarepeo",
  [string]$Region = "eu-north-1",
  [string]$SsoStartUrl = "https://d-c367697fc4.awsapps.com/start",
  [string]$SsoAccountId = "147885329053",
  [string]$SsoRoleName = "AdministratorAccess",
  [string]$AmplifyAppId = "d19mquq8thd1uj",
  [string]$Branch = "main",
  [switch]$SkipChecks,
  [switch]$SkipGit,
  [switch]$SkipAmplify,
  [switch]$NoWait,
  [int]$PollSeconds = 20,
  [int]$MaxWaitMinutes = 30
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-CheckedCommand([string]$Exe, [string[]]$Arguments) {
  Write-Host "> $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Comanda a esuat: $Exe $($Arguments -join ' ')"
  }
}

function Resolve-CommandPath([string]$Name, [string[]]$FallbackPaths = @()) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($path in $FallbackPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  throw "Comanda '$Name' nu este disponibila in PATH."
}

function Test-AwsIdentity() {
  & $AwsExe sts get-caller-identity --profile $Profile --region $Region --output json 1>$null 2>$null
  return $LASTEXITCODE -eq 0
}

function Ensure-AwsProfile() {
  $configuredStartUrl = (& $AwsExe configure get sso_start_url --profile $Profile 2>$null)
  $configuredAccountId = (& $AwsExe configure get sso_account_id --profile $Profile 2>$null)
  $configuredRoleName = (& $AwsExe configure get sso_role_name --profile $Profile 2>$null)

  if ($configuredStartUrl -and $configuredAccountId -and $configuredRoleName) {
    return
  }

  Write-Host "Configurez profilul AWS SSO '$Profile' automat..." -ForegroundColor Yellow
  Invoke-CheckedCommand $AwsExe @("configure", "set", "sso_start_url", $SsoStartUrl, "--profile", $Profile)
  Invoke-CheckedCommand $AwsExe @("configure", "set", "sso_region", $Region, "--profile", $Profile)
  Invoke-CheckedCommand $AwsExe @("configure", "set", "sso_account_id", $SsoAccountId, "--profile", $Profile)
  Invoke-CheckedCommand $AwsExe @("configure", "set", "sso_role_name", $SsoRoleName, "--profile", $Profile)
  Invoke-CheckedCommand $AwsExe @("configure", "set", "region", $Region, "--profile", $Profile)
  Invoke-CheckedCommand $AwsExe @("configure", "set", "output", "json", "--profile", $Profile)
}

function Ensure-AwsLogin() {
  Ensure-AwsProfile

  if (Test-AwsIdentity) {
    Write-Host "AWS credentials active pentru profilul $Profile." -ForegroundColor Green
    return
  }

  Write-Host "Nu exista sesiune AWS activa pentru profilul $Profile. Pornesc AWS SSO login..." -ForegroundColor Yellow
  Invoke-CheckedCommand $AwsExe @("sso", "login", "--profile", $Profile, "--use-device-code")

  if (-not (Test-AwsIdentity)) {
    throw "AWS SSO login nu a produs credentiale valide. Ruleaza scripts\aws-sso-login.ps1 pentru configurarea profilului $Profile."
  }
}

function Get-GitPorcelain() {
  return (& $GitExe status --porcelain)
}

Push-Location (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
try {
  $GitExe = Resolve-CommandPath "git" @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe"
  )
  $NpmExe = Resolve-CommandPath "npm.cmd" @(
    (Join-Path $env:ProgramFiles "nodejs\npm.cmd")
  )
  $AwsExe = Resolve-CommandPath "aws" @(
    "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
  )

  Write-Step "Context"
  Invoke-CheckedCommand $GitExe @("status", "--short", "--branch")
  Write-Host "Amplify app: $AmplifyAppId / branch: $Branch / region: $Region / profile: $Profile"

  if (-not $SkipChecks) {
    Write-Step "Verificari locale"
    Invoke-CheckedCommand $NpmExe @("run", "typecheck", "--", "--pretty", "false")
    Invoke-CheckedCommand $NpmExe @("run", "lint")
    Invoke-CheckedCommand $NpmExe @("test")
    Invoke-CheckedCommand $NpmExe @("run", "build")
  }

  if (-not $SkipGit) {
    Write-Step "Git commit si push"
    $currentBranch = (& $GitExe branch --show-current).Trim()
    if ($currentBranch -ne $Branch) {
      throw "Branch curent '$currentBranch', dar deploy-ul este configurat pentru '$Branch'."
    }

    $changes = Get-GitPorcelain
    if ($changes) {
      if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        throw "Exista modificari necomise. Ruleaza cu -CommitMessage `"mesaj commit`" sau foloseste -SkipGit."
      }
      Invoke-CheckedCommand $GitExe @("add", "-A")
      Invoke-CheckedCommand $GitExe @("commit", "-m", $CommitMessage)
    } else {
      Write-Host "Nu exista modificari locale de comis." -ForegroundColor Green
    }

    Invoke-CheckedCommand $GitExe @("pull", "--ff-only", "origin", $Branch)
    Invoke-CheckedCommand $GitExe @("push", "origin", $Branch)
  }

  if (-not $SkipAmplify) {
    Write-Step "Amplify start-job"
    Ensure-AwsLogin
    $jobJson = & $AwsExe amplify start-job `
      --app-id $AmplifyAppId `
      --branch-name $Branch `
      --job-type RELEASE `
      --profile $Profile `
      --region $Region `
      --output json
    if ($LASTEXITCODE -ne 0) {
      throw "Nu am putut porni jobul Amplify."
    }

    $job = $jobJson | ConvertFrom-Json
    $jobId = $job.jobSummary.jobId
    Write-Host "Job Amplify pornit: $jobId" -ForegroundColor Green

    if (-not $NoWait) {
      Write-Step "Astept finalizarea jobului Amplify"
      $deadline = (Get-Date).AddMinutes($MaxWaitMinutes)
      do {
        Start-Sleep -Seconds $PollSeconds
        $statusJson = & $AwsExe amplify get-job `
          --app-id $AmplifyAppId `
          --branch-name $Branch `
          --job-id $jobId `
          --profile $Profile `
          --region $Region `
          --output json
        if ($LASTEXITCODE -ne 0) {
          throw "Nu am putut citi statusul jobului Amplify $jobId."
        }

        $status = ($statusJson | ConvertFrom-Json).job.summary.status
        Write-Host "Amplify job $jobId status: $status"
        if ($status -in @("SUCCEED", "FAILED", "CANCELLED")) {
          break
        }
      } while ((Get-Date) -lt $deadline)

      if ($status -ne "SUCCEED") {
        throw "Amplify job $jobId s-a incheiat cu status: $status"
      }
    }
  }

  Write-Step "Deploy complet"
  Write-Host "Procesul build -> GitHub -> Amplify s-a incheiat." -ForegroundColor Green
} finally {
  Pop-Location
}
