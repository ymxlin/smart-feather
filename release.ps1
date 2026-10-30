# Builds the add-on and publishes it as the latest GitHub release, which installed copies update from.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$version = (Get-Content "$root\manifest.json" -Raw | ConvertFrom-Json).version
$xpi = & "$root\build.ps1"
gh release create "v$version" $xpi "$root\dist\updates.json" --title "Smart Feather $version" --generate-notes --latest
if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }
