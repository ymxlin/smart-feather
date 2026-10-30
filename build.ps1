# Packs the add-on into smart-feather\dist\smart-feather-<version>.xpi and writes dist\updates.json.
# To publish: attach both files to a GitHub release tagged v<version>. Betterbird reads updates.json from the
# latest release (update_url in manifest.json), so a release must never be published without its own updates.json.
$root = $PSScriptRoot
$manifest = Get-Content "$root\manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$gecko = $manifest.browser_specific_settings.gecko
$dist = New-Item -ItemType Directory -Force "$root\dist"
$name = "smart-feather-$version.xpi"
$xpi = "$dist\$name"
Compress-Archive -Force -DestinationPath "$xpi.zip" -Path "$root\manifest.json", "$root\background.js", "$root\api", "$root\_locales", "$root\icons"
Move-Item -Force "$xpi.zip" $xpi

$hash = (Get-FileHash $xpi -Algorithm SHA256).Hash.ToLower()
$releases = $gecko.update_url -replace '/latest/download/updates\.json$', ''
$update = [ordered]@{
  version      = $version
  update_link  = "$releases/download/v$version/$name"
  update_hash  = "sha256:$hash"
  applications = @{ gecko = @{ strict_min_version = $gecko.strict_min_version } }
}
@{ addons = @{ $gecko.id = @{ updates = @($update) } } } | ConvertTo-Json -Depth 6 | Set-Content "$dist\updates.json" -Encoding utf8NoBOM
$xpi
