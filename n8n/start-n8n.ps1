# Loads n8n/.env (see .env.example) into the process environment, then starts n8n.
# Usage: powershell -ExecutionPolicy Bypass -File "n8n\start-n8n.ps1"

$envFile = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $envFile)) {
    Write-Error "Missing $envFile. Copy n8n\.env.example to n8n\.env and fill in real values first."
    exit 1
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) { return }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()
    $value = $value.Trim('"').Trim("'")

    if ($value -ne "") {
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

$missing = @("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") | Where-Object {
    [string]::IsNullOrEmpty([System.Environment]::GetEnvironmentVariable($_, "Process"))
}

if ($missing.Count -gt 0) {
    Write-Warning "Missing required value(s) in n8n\.env: $($missing -join ', '). The poster workflow will fail until these are set."
}

n8n start
