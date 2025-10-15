# Fix PowerShell PATH Loading
# This script adds a PATH refresh function to your PowerShell profile

Write-Host "=== PowerShell PATH Fix ===" -ForegroundColor Cyan
Write-Host ""

# Get PowerShell profile path
$profilePath = $PROFILE.CurrentUserAllHosts
Write-Host "PowerShell Profile: $profilePath" -ForegroundColor Yellow

# Create profile directory if it doesn't exist
$profileDir = Split-Path -Parent $profilePath
if (!(Test-Path $profileDir)) {
    Write-Host "Creating profile directory..." -ForegroundColor Green
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

# Create profile file if it doesn't exist
if (!(Test-Path $profilePath)) {
    Write-Host "Creating PowerShell profile..." -ForegroundColor Green
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
}

# Read current profile content
$profileContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
if (!$profileContent) { $profileContent = "" }

# Define the PATH refresh function
$pathRefreshFunction = @'

# Function to refresh PATH from registry
function Refresh-Path {
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Host "PATH refreshed from registry" -ForegroundColor Green
}

# Auto-refresh PATH on profile load (optional - uncomment if desired)
# Refresh-Path

'@

# Check if function already exists
if ($profileContent -notlike "*Refresh-Path*") {
    Write-Host "Adding PATH refresh function to profile..." -ForegroundColor Green
    Add-Content -Path $profilePath -Value $pathRefreshFunction
    Write-Host "Function added successfully!" -ForegroundColor Green
} else {
    Write-Host "PATH refresh function already exists in profile" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "How to use:" -ForegroundColor White
Write-Host "  1. Restart PowerShell, or run: . `$PROFILE" -ForegroundColor Gray
Write-Host "  2. Whenever PATH changes, run: Refresh-Path" -ForegroundColor Gray
Write-Host "  3. Or manually refresh PATH now with the command below" -ForegroundColor Gray
Write-Host ""

# Refresh PATH now
Write-Host "Refreshing PATH in current session..." -ForegroundColor Yellow
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

Write-Host ""
Write-Host "Testing claude command..." -ForegroundColor Yellow
try {
    $claudeVersion = & claude --version 2>&1
    Write-Host "SUCCESS! Claude is now available: $claudeVersion" -ForegroundColor Green
} catch {
    Write-Host "Claude not found. The PATH includes:" -ForegroundColor Red
    $env:PATH -split ';' | Where-Object { $_ -like '*npm*' } | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "Try restarting PowerShell completely." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Your profile location: $profilePath" -ForegroundColor Cyan
