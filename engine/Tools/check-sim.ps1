# Builds the checks in engine/Tools with Windows' own C# compiler (no Unity or .NET SDK needed) and
# runs them against engine-data/ (made by tools/engine-export.ts):
#   MovementCheck: Movement.cs against the TypeScript movement's 780 steps.
#   WorldCheck: World.cs (floors, stairs) against levels.ts, and the client's collision against Rapier.
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot/../.."
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$web = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll"
$sim = Get-ChildItem "$root\engine\Assets\Scripts\Sim\*.cs" | ForEach-Object { $_.FullName }
$failed = 0
foreach ($check in "MovementCheck", "WorldCheck") {
  $out = Join-Path $env:TEMP "haunted-$check.exe"
  & $csc /nologo /optimize /out:$out /reference:$web @sim "$root\engine\Tools\$check.cs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $out $root
  if ($LASTEXITCODE -ne 0) { $failed = 1 }
}
exit $failed
