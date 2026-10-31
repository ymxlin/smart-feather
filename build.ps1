# Packs the add-on into dist\smart-feather-<version>.xpi and writes dist\updates.json.
# The update address comes from this checkout's GitHub remote, so a copy of the template watches only its own
# releases. Publish with release.ps1; a release must never go out without its own updates.json.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$upstream = "ymxlin/smart-feather"

$remote = git -C $root remote get-url origin
if ($remote -notmatch 'github\.com[:/]([^/]+/[^/]+?)(\.git)?$') {
  throw "origin is not a GitHub repository: $remote"
}
$repo = $Matches[1]

$manifest = Get-Content "$root\manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$gecko = $manifest.browser_specific_settings.gecko
$gecko | Add-Member -Force update_url "https://github.com/$repo/releases/latest/download/updates.json"
# A copy needs its own ID, or its updates would replace the original add-on and the other way round.
if ($repo -ne $upstream) {
  $gecko.id = ($repo -replace '/', '-') + "@github"
}

$dist = New-Item -ItemType Directory -Force "$root\dist"
$stage = "$dist\stage"
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory $stage | Out-Null
Copy-Item "$root\background.js", "$root\ai", "$root\api", "$root\_locales", "$root\icons", "$root\options", "$root\search" $stage -Recurse
$manifest | ConvertTo-Json -Depth 10 | Set-Content "$stage\manifest.json" -Encoding utf8NoBOM

$name = "smart-feather-$version.xpi"
$xpi = "$dist\$name"
Compress-Archive -Force -DestinationPath "$xpi.zip" -Path "$stage\*"
Move-Item -Force "$xpi.zip" $xpi
Remove-Item -Recurse -Force $stage

$hash = (Get-FileHash $xpi -Algorithm SHA256).Hash.ToLower()
$update = [ordered]@{
  version      = $version
  update_link  = "https://github.com/$repo/releases/download/v$version/$name"
  update_hash  = "sha256:$hash"
  applications = @{ gecko = @{ strict_min_version = $gecko.strict_min_version } }
}
@{ addons = @{ $gecko.id = @{ updates = @($update) } } } | ConvertTo-Json -Depth 6 | Set-Content "$dist\updates.json" -Encoding utf8NoBOM
$xpi
