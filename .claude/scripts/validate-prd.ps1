<#
.SYNOPSIS
    Validates a PRD JSON file against the HQ PRD schema.

.DESCRIPTION
    Checks that a prd.json file conforms to the PRD schema defined in
    knowledge/hq-core/prd-schema.md. Validates required fields, e2eTests
    presence per user story, field types, and referential integrity.

.PARAMETER PrdPath
    Path to the prd.json file to validate.

.EXAMPLE
    .\.claude\scripts\validate-prd.ps1 -PrdPath projects\my-project\prd.json

.EXAMPLE
    .\.claude\scripts\validate-prd.ps1 -PrdPath C:\hq-e2e\projects\my-project\prd.json
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$PrdPath
)

# --- Helpers ---

$script:errors = @()
$script:warnings = @()

function Add-Error {
    param([string]$Message)
    $script:errors += $Message
}

function Add-Warning {
    param([string]$Message)
    $script:warnings += $Message
}

# --- Main ---

# Check file exists
if (-not (Test-Path $PrdPath)) {
    Write-Host "ERROR: PRD file not found: $PrdPath" -ForegroundColor Red
    exit 1
}

# Parse JSON
try {
    $prd = Get-Content -Path $PrdPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "ERROR: Failed to parse JSON: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Validating PRD: $PrdPath" -ForegroundColor Cyan
Write-Host "---" -ForegroundColor Gray

# --- Top-level fields ---

if (-not $prd.name) {
    Add-Error "Missing required top-level field: 'name'"
}

if (-not $prd.description) {
    Add-Error "Missing required top-level field: 'description'"
}

if (-not $prd.branchName) {
    Add-Error "Missing required top-level field: 'branchName'"
}

if (-not $prd.userStories -or $prd.userStories.Count -eq 0) {
    Add-Error "Missing or empty required field: 'userStories'"
}

if (-not $prd.metadata) {
    Add-Error "Missing required top-level field: 'metadata'"
} else {
    if (-not $prd.metadata.createdAt) {
        Add-Error "Missing required metadata field: 'createdAt'"
    }
    if (-not $prd.metadata.goal) {
        Add-Error "Missing required metadata field: 'goal'"
    }
    if (-not $prd.metadata.successCriteria) {
        Add-Error "Missing required metadata field: 'successCriteria'"
    }
    if (-not $prd.metadata.qualityGates -or $prd.metadata.qualityGates.Count -eq 0) {
        Add-Error "Missing or empty required metadata field: 'qualityGates'"
    }
}

# --- User Stories ---

$storyIds = @()

if ($prd.userStories -and $prd.userStories.Count -gt 0) {
    foreach ($story in $prd.userStories) {
        $storyLabel = if ($story.id) { $story.id } else { "(unknown)" }

        # Required fields
        if (-not $story.id) {
            Add-Error "Story missing required field: 'id'"
        } elseif ($story.id -notmatch '^US-\d{3}$') {
            Add-Error "Story ${storyLabel}: 'id' must match format US-NNN (e.g. US-001), got '$($story.id)'"
        } else {
            $storyIds += $story.id
        }

        if (-not $story.title) {
            Add-Error "Story ${storyLabel}: missing required field 'title'"
        }

        if (-not $story.description) {
            Add-Error "Story ${storyLabel}: missing required field 'description'"
        }

        if (-not $story.acceptanceCriteria -or $story.acceptanceCriteria.Count -eq 0) {
            Add-Error "Story ${storyLabel}: missing or empty required field 'acceptanceCriteria'"
        }

        if ($null -eq $story.priority) {
            Add-Error "Story ${storyLabel}: missing required field 'priority'"
        }

        if ($null -eq $story.passes) {
            Add-Error "Story ${storyLabel}: missing required field 'passes'"
        }

        # --- e2eTests validation ---
        if (-not $story.e2eTests -or $story.e2eTests.Count -eq 0) {
            Add-Error "Story ${storyLabel}: missing or empty required field 'e2eTests'. Every story must have at least one E2E test definition."
        } else {
            $hasCriticalPath = $false
            $testIndex = 0

            foreach ($test in $story.e2eTests) {
                $testLabel = "Story ${storyLabel}, e2eTests[${testIndex}]"

                if (-not $test.scenario) {
                    Add-Error "${testLabel}: missing required field 'scenario'"
                }

                if (-not $test.userJourney) {
                    Add-Error "${testLabel}: missing required field 'userJourney'"
                }

                if ($null -eq $test.criticalPath) {
                    Add-Error "${testLabel}: missing required field 'criticalPath'"
                } elseif ($test.criticalPath -eq $true) {
                    $hasCriticalPath = $true
                }

                $testIndex++
            }

            if (-not $hasCriticalPath) {
                Add-Error "Story ${storyLabel}: must have at least one e2eTests entry with 'criticalPath: true'"
            }
        }

        # --- dependsOn validation ---
        if ($story.dependsOn -and $story.dependsOn.Count -gt 0) {
            foreach ($dep in $story.dependsOn) {
                if ($dep -notmatch '^US-\d{3}$') {
                    Add-Error "Story ${storyLabel}: dependsOn reference '$dep' does not match US-NNN format"
                }
            }
        }
    }

    # Check dependsOn references point to valid story IDs
    foreach ($story in $prd.userStories) {
        if ($story.dependsOn -and $story.dependsOn.Count -gt 0) {
            foreach ($dep in $story.dependsOn) {
                if ($dep -notin $storyIds) {
                    Add-Error "Story $($story.id): dependsOn references '$dep' which does not exist in this PRD"
                }
            }
        }
    }

    # Check for duplicate IDs
    $duplicates = $storyIds | Group-Object | Where-Object { $_.Count -gt 1 }
    foreach ($dup in $duplicates) {
        Add-Error "Duplicate story ID: '$($dup.Name)' appears $($dup.Count) times"
    }
}

# --- Report ---

Write-Host ""

if ($script:warnings.Count -gt 0) {
    Write-Host "WARNINGS ($($script:warnings.Count)):" -ForegroundColor Yellow
    foreach ($w in $script:warnings) {
        Write-Host "  WARNING: $w" -ForegroundColor Yellow
    }
    Write-Host ""
}

if ($script:errors.Count -gt 0) {
    Write-Host "ERRORS ($($script:errors.Count)):" -ForegroundColor Red
    foreach ($e in $script:errors) {
        Write-Host "  ERROR: $e" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "VALIDATION FAILED: $($script:errors.Count) error(s) found." -ForegroundColor Red
    exit 1
} else {
    $storyCount = if ($prd.userStories) { $prd.userStories.Count } else { 0 }
    $totalTests = 0
    $criticalTests = 0
    if ($prd.userStories) {
        foreach ($story in $prd.userStories) {
            if ($story.e2eTests) {
                $totalTests += $story.e2eTests.Count
                foreach ($test in $story.e2eTests) {
                    if ($test.criticalPath -eq $true) {
                        $criticalTests++
                    }
                }
            }
        }
    }
    Write-Host "VALIDATION PASSED" -ForegroundColor Green
    Write-Host "  Project: $($prd.name)" -ForegroundColor Green
    Write-Host "  Stories: $storyCount" -ForegroundColor Green
    Write-Host "  E2E Tests: $totalTests ($criticalTests critical path)" -ForegroundColor Green
    exit 0
}
