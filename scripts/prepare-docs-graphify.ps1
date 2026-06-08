[CmdletBinding()]
param(
    [string[]]$Roots = @(
        'F:\__past-work',
        'F:\__temporary-noncode',
        'F:\DEKSTOP',
        'F:\docs',
        'F:\papers+apps'
    ),
    [string]$Destination = 'F:\docs-graphify',
    [string[]]$Extensions = @(
        '.md', '.mdx', '.qmd', '.txt', '.rst',
        '.html', '.htm',
        '.yaml', '.yml', '.json', '.jsonl',
        '.csv', '.tsv',
        '.pdf', '.docx', '.xlsx',
        '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'
    ),
    [switch]$IncludeCode,
    [switch]$Execute,
    [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'

$codeExtensions = @(
    '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.css', '.scss', '.sql', '.sh', '.ps1'
)

if ($IncludeCode) {
    $Extensions = @($Extensions + $codeExtensions | Sort-Object -Unique)
}

$extensionSet = @{}
foreach ($extension in $Extensions) {
    if ([string]::IsNullOrWhiteSpace($extension)) {
        continue
    }
    $normalized = $extension.Trim().ToLowerInvariant()
    if (-not $normalized.StartsWith('.')) {
        $normalized = ".$normalized"
    }
    $extensionSet[$normalized] = $true
}

$excludePathPattern = [regex]'(?i)\\(\.git|node_modules|__pycache__|\.venv|dist|build|\.next|\.turbo|writing-system-headless-browser-profile|writing-system-runtime-check|cdp-profile-[^\\]+|profile[^\\]*|Default|ShaderCache|GrShaderCache|GraphiteDawnCache|Crashpad)(\\|$)'

function Get-ShortHash {
    param([Parameter(Mandatory = $true)][string]$Value)

    $sha = [System.Security.Cryptography.SHA1]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value.ToLowerInvariant())
        $hash = $sha.ComputeHash($bytes)
        return (($hash | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 12)
    }
    finally {
        $sha.Dispose()
    }
}

function ConvertTo-SafeFileNamePart {
    param([Parameter(Mandatory = $true)][string]$Value)

    $invalid = [regex]::Escape((-join [System.IO.Path]::GetInvalidFileNameChars()))
    $safe = [regex]::Replace($Value, "[$invalid]+", '_')
    $safe = [regex]::Replace($safe, '\s+', '_').Trim('_')
    if ([string]::IsNullOrWhiteSpace($safe)) {
        return 'file'
    }
    return $safe
}

function Get-FlatDestinationName {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][System.IO.FileInfo]$File,
        [Parameter(Mandatory = $true)][hashtable]$UsedNames
    )

    $nameWithoutExtension = [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
    $extension = $File.Extension.ToLowerInvariant()
    $originalName = $File.Name
    $originalKey = $originalName.ToLowerInvariant()

    if (-not $UsedNames.ContainsKey($originalKey)) {
        $UsedNames[$originalKey] = $true
        return $originalName
    }

    $hash = Get-ShortHash $File.FullName
    $candidate = "${nameWithoutExtension}__${hash}${extension}"
    $candidateKey = $candidate.ToLowerInvariant()
    if (-not $UsedNames.ContainsKey($candidateKey)) {
        $UsedNames[$candidateKey] = $true
        return $candidate
    }

    $counter = 2
    do {
        $candidate = "${nameWithoutExtension}__${hash}__${counter}${extension}"
        $candidateKey = $candidate.ToLowerInvariant()
        $counter++
    } while ($UsedNames.ContainsKey($candidateKey))

    $UsedNames[$candidateKey] = $true
    return $candidate
}

$resolvedRoots = foreach ($root in $Roots) {
    if (Test-Path -LiteralPath $root) {
        (Resolve-Path -LiteralPath $root).Path
    }
    else {
        Write-Warning "Skipping missing root: $root"
    }
}

if (-not $resolvedRoots) {
    throw 'No input roots exist.'
}

if ($Execute -and -not (Test-Path -LiteralPath $Destination)) {
    New-Item -ItemType Directory -Path $Destination | Out-Null
}

$records = New-Object System.Collections.Generic.List[object]
$usedDestinationNames = @{}

foreach ($root in $resolvedRoots) {
    Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object {
            -not $excludePathPattern.IsMatch($_.FullName) -and
            $extensionSet.ContainsKey($_.Extension.ToLowerInvariant())
        } |
        ForEach-Object {
            $destinationName = Get-FlatDestinationName -Root $root -File $_ -UsedNames $usedDestinationNames
            $destinationPath = Join-Path $Destination $destinationName
            $status = if ($Execute) { 'pending' } else { 'dry-run' }

            if ($Execute) {
                if ((Test-Path -LiteralPath $destinationPath) -and -not $Overwrite) {
                    $status = 'skipped-existing'
                }
                else {
                    Copy-Item -LiteralPath $_.FullName -Destination $destinationPath -Force:$Overwrite
                    $status = 'copied'
                }
            }

            $records.Add([pscustomobject]@{
                Status = $status
                Extension = $_.Extension.ToLowerInvariant()
                SizeBytes = $_.Length
                SourcePath = $_.FullName
                DestinationPath = $destinationPath
                LastWriteTime = $_.LastWriteTime
            })
        }
}

$totalBytes = ($records | Measure-Object SizeBytes -Sum).Sum
$mode = if ($Execute) { 'EXECUTE' } else { 'DRY RUN' }

Write-Host "Mode: $mode"
Write-Host "Roots: $($resolvedRoots.Count)"
Write-Host "Destination: $Destination"
Write-Host "Matched files: $($records.Count)"
Write-Host ("Matched size: {0} MB" -f ([math]::Round($totalBytes / 1MB, 2)))
Write-Host ''

$records |
    Group-Object Extension |
    Sort-Object Count -Descending |
    Select-Object @{Name = 'Extension'; Expression = { $_.Name } },
        @{Name = 'Files'; Expression = { $_.Count } },
        @{Name = 'SizeMB'; Expression = { [math]::Round((($_.Group | Measure-Object SizeBytes -Sum).Sum / 1MB), 2) } } |
    Format-Table -AutoSize

if ($Execute) {
    $manifestPath = Join-Path $Destination 'docs-graphify-manifest.csv'
    $records | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8
    Write-Host "Manifest: $manifestPath"
}
else {
    Write-Host 'No files copied. Re-run with -Execute to create the flat folder copy.'
}
