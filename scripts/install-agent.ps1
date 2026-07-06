param (
    [Parameter(Mandatory=$true)]
    [string]$AgentPath
)

if (-not (Test-Path $AgentPath)) {
    Write-Error "File not found: $AgentPath"
    exit 1
}

$filename = [System.IO.Path]::GetFileNameWithoutExtension($AgentPath)
$skillName = "agency-" + $filename

$destDir = Join-Path ".agents\skills" $skillName
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$destFile = Join-Path $destDir "SKILL.md"
Copy-Item -Path $AgentPath -Destination $destFile -Force

Write-Host "Success: Installed $filename as Antigravity skill: $skillName"
