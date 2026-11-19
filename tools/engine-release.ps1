# Step F: zips the Unity release build for itch.io and prints the butler command.
# First build it:  Unity.exe -batchmode -quit -projectPath engine -executeMethod Haunted.Editor.ProjectSetup.BuildRelease -logFile <log>
# Run from the repository root:  powershell -File tools/engine-release.ps1
$ErrorActionPreference = "Stop"
$release = Get-Content "engine/Assets/Resources/Data/release.json" -Raw | ConvertFrom-Json
$folder = "engine/Build/Release/Haunted Lobby"
if (-not (Test-Path "$folder/Haunted Lobby.exe")) { throw "No release build in ${folder}: run ProjectSetup.BuildRelease first." }
$zip = "engine/Build/Release/HauntedLobby-$($release.version)-windows.zip"
if (Test-Path $zip) { Remove-Item $zip }
# Windows' own tar makes zip files and is much faster than Compress-Archive on 2 GB.
tar -a -c -f $zip -C "engine/Build/Release" "Haunted Lobby"
if ($LASTEXITCODE -ne 0) { throw "tar failed" }
$mb = [math]::Round((Get-Item $zip).Length / 1MB)
Write-Output "Made $zip ($mb MB)."
$target = if ($release.itch) { $release.itch } else { "<you>/<game>" }
Write-Output "Upload with itch.io's butler (it sends only what changed next time):"
Write-Output "  butler push `"$folder`" ${target}:$($release.channel) --userversion $($release.version)"
