# Builds engine/Tools/MovementCheck.cs with Windows' own C# compiler (no Unity or .NET SDK needed)
# and checks the C# movement against the TypeScript movement's 780 steps.
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot/../.."
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$web = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll"
$out = Join-Path $env:TEMP "haunted-movement-check.exe"
& $csc /nologo /optimize /out:$out /reference:$web "$root\engine\Assets\Scripts\Sim\Movement.cs" "$root\engine\Tools\MovementCheck.cs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $out $root
exit $LASTEXITCODE
