$TargetDir = "C:\Users\Kartikeya\.gemini\antigravity-ide\scratch\ssmp-platform-main"

$Replacements = @(
    @{ From = "queries"; To = "queries" },
    @{ From = "Queries"; To = "Queries" },
    @{ From = "QUERIES"; To = "QUERIES" },
    @{ From = "query"; To = "query" },
    @{ From = "Query"; To = "Query" },
    @{ From = "QUERY"; To = "QUERY" }
)

$ExcludeDirs = @("node_modules", ".git", ".github")
$ExcludeFiles = @("package-lock.json")

function Process-Directory {
    param([string]$Path)
    
    # Process files
    Get-ChildItem -Path $Path -File | Where-Object { 
        $_.Name -notin $ExcludeFiles -and $_.Extension -notmatch "\.(jpg|jpeg|png|gif|pdf|ico)$" 
    } | ForEach-Object {
        $filePath = $_.FullName
        $content = Get-Content -Path $filePath -Raw -ErrorAction SilentlyContinue
        if ($null -ne $content) {
            $newContent = $content
            foreach ($r in $Replacements) {
                # Case-sensitive replace
                $newContent = $newContent -creplace $r.From, $r.To
            }
            if ($content -cne $newContent) {
                Set-Content -Path $filePath -Value $newContent -NoNewline
                Write-Host "Updated content in: $filePath"
            }
        }
        
        # Rename file
        if ($_.Name -match "(?i)query") {
            $newName = $_.Name
            foreach ($r in $Replacements) {
                $newName = $newName -creplace $r.From, $r.To
            }
            if ($newName -cne $_.Name) {
                Rename-Item -Path $filePath -NewName $newName
                Write-Host "Renamed file: $filePath -> $newName"
            }
        }
    }

    # Process directories
    Get-ChildItem -Path $Path -Directory | Where-Object { $_.Name -notin $ExcludeDirs } | ForEach-Object {
        $dirPath = $_.FullName
        Process-Directory -Path $dirPath
        
        if ($_.Name -match "(?i)query") {
            $newName = $_.Name
            foreach ($r in $Replacements) {
                $newName = $newName -creplace $r.From, $r.To
            }
            if ($newName -cne $_.Name) {
                Rename-Item -Path $dirPath -NewName $newName
                Write-Host "Renamed directory: $dirPath -> $newName"
            }
        }
    }
}

Write-Host "Starting rename process..."
Process-Directory -Path $TargetDir
Write-Host "Rename process completed."
