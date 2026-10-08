$ErrorActionPreference = 'Stop'
$workerDirectory = $PSScriptRoot
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $workerDirectory '.env'))) { throw 'Configure worker/.env first.' }
Push-Location -LiteralPath $workerDirectory
try {
    & $nodeExecutable --env-file=.env src/run.js --check-config
    if ($LASTEXITCODE -ne 0) { throw 'Backend is not ready. Check deployment and matching OTA_WORKER_SECRET.' }
    $logDirectory = Join-Path $workerDirectory 'evidence'
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    $workerProcess = Start-Process -FilePath $nodeExecutable -WorkingDirectory $workerDirectory -ArgumentList @('--env-file=.env','src/run.js','--daemon') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'worker-out.log') -RedirectStandardError (Join-Path $logDirectory 'worker-error.log') -PassThru
    Write-Output "Worker started with PID $($workerProcess.Id). Keep Windows awake and connected."
} finally { Pop-Location }
