# Refresh PowerShell PATH from registry
Write-Host "Refreshing PATH environment variable..." -ForegroundColor Green

$machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$env:PATH = $machinePath + ";" + $userPath

Write-Host "PATH refreshed successfully!" -ForegroundColor Green
Write-Host "Testing claude command..." -ForegroundColor Yellow

try {
    $claudeVersion = & claude --version 2>&1
    Write-Host "Success! Claude is now available: $claudeVersion" -ForegroundColor Green
} catch {
    Write-Host "Claude command still not found. You may need to restart PowerShell." -ForegroundColor Red
}
