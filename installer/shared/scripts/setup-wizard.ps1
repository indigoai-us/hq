# =============================================================================
# HQ Post-Install Setup Wizard (Windows)
# A friendly terminal-based wizard to configure HQ after installation
# =============================================================================

param(
    [string]$HQDir = "$env:LOCALAPPDATA\hq"
)

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

function Write-ColorText {
    param(
        [string]$Text,
        [ConsoleColor]$Color = [ConsoleColor]::White
    )
    $oldColor = [Console]::ForegroundColor
    [Console]::ForegroundColor = $Color
    Write-Host $Text
    [Console]::ForegroundColor = $oldColor
}

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-ColorText "========================================" Cyan
    Write-ColorText "  $Text" Cyan
    Write-ColorText "========================================" Cyan
    Write-Host ""
}

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-ColorText "--- $Text ---" Yellow
    Write-Host ""
}

function Read-UserInput {
    param(
        [string]$Prompt,
        [string]$Default = ""
    )

    if ($Default) {
        Write-Host "$Prompt [$Default]: " -NoNewline
    } else {
        Write-Host "${Prompt}: " -NoNewline
    }

    $input = Read-Host
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $Default
    }
    return $input
}

function Read-YesNo {
    param(
        [string]$Prompt,
        [bool]$Default = $true
    )

    $defaultText = if ($Default) { "Y/n" } else { "y/N" }
    Write-Host "$Prompt [$defaultText]: " -NoNewline
    $input = Read-Host

    if ([string]::IsNullOrWhiteSpace($input)) {
        return $Default
    }

    return $input.ToLower().StartsWith("y")
}

function Read-MultipleInputs {
    param(
        [string]$Prompt,
        [string]$HelpText = "Enter each item on a new line. Type 'done' when finished."
    )

    Write-Host $Prompt
    Write-ColorText $HelpText Gray
    Write-Host ""

    $items = @()
    while ($true) {
        Write-Host "  > " -NoNewline
        $input = Read-Host
        if ($input.ToLower() -eq "done" -or [string]::IsNullOrWhiteSpace($input)) {
            if ($items.Count -eq 0 -and [string]::IsNullOrWhiteSpace($input)) {
                continue
            }
            break
        }
        $items += $input
    }
    return $items
}

# -----------------------------------------------------------------------------
# Wizard Steps
# -----------------------------------------------------------------------------

function Show-Welcome {
    Clear-Host
    Write-Header "Welcome to HQ!"

    Write-Host "HQ is your personal AI operating system for orchestrating"
    Write-Host "AI workers, projects, and content."
    Write-Host ""
    Write-Host "This wizard will help you set up your profile and get started."
    Write-Host ""
    Write-ColorText "What we'll do:" Yellow
    Write-Host "  1. Set up your profile (name, role, goals)"
    Write-Host "  2. Configure your preferences"
    Write-Host "  3. Show you how to get started"
    Write-Host ""

    $continue = Read-YesNo "Ready to begin?"
    return $continue
}

function Collect-Profile {
    Write-Section "Your Profile"

    $profile = @{}

    $profile.Name = Read-UserInput "What's your name?"
    $profile.Role = Read-UserInput "What's your role/title?" "Professional"
    $profile.Location = Read-UserInput "Where are you located? (optional)"

    Write-Host ""
    Write-ColorText "Great! Now let's set some goals." Yellow
    Write-Host ""

    $profile.Goals = Read-MultipleInputs "What are your main goals? (what do you want to achieve with HQ)"

    if ($profile.Goals.Count -eq 0) {
        $profile.Goals = @("Be more productive", "Automate repetitive tasks", "Build cool projects")
    }

    return $profile
}

function Collect-Preferences {
    Write-Section "Your Preferences"

    $prefs = @{}

    Write-Host "How would you describe your preferred communication style?"
    Write-Host ""
    Write-Host "  1. Direct and concise"
    Write-Host "  2. Detailed explanations"
    Write-Host "  3. Casual and friendly"
    Write-Host "  4. Professional and formal"
    Write-Host ""

    $choice = Read-UserInput "Enter your choice (1-4)" "1"

    $styles = @{
        "1" = "Direct and concise"
        "2" = "Detailed explanations"
        "3" = "Casual and friendly"
        "4" = "Professional and formal"
    }
    $prefs.CommunicationStyle = if ($styles.ContainsKey($choice)) { $styles[$choice] } else { $styles["1"] }

    Write-Host ""
    $prefs.Priorities = Read-MultipleInputs "What are your work priorities? (what matters most to you)"

    if ($prefs.Priorities.Count -eq 0) {
        $prefs.Priorities = @("Quality over speed", "Clear communication")
    }

    Write-Host ""
    $prefs.Tools = Read-MultipleInputs "What tools/technologies do you use? (optional)"

    return $prefs
}

function Collect-CompanyInfo {
    Write-Section "Company/Project (Optional)"

    $company = @{}

    $hasCompany = Read-YesNo "Do you want to add a company or project?" $false

    if ($hasCompany) {
        $company.Name = Read-UserInput "Company/Project name"
        $company.Description = Read-UserInput "Brief description"
        $company.YourRole = Read-UserInput "Your role there"
    }

    return $company
}

function Write-AgentsMd {
    param(
        [hashtable]$Profile,
        [hashtable]$Preferences,
        [hashtable]$Company
    )

    $agentsPath = Join-Path $HQDir "agents.md"

    $content = @"
# Agent Profile

Your personal AI profile. Claude uses this to understand your preferences, goals, and communication style.

## Personal Information

**Name:** $($Profile.Name)
**Role:** $($Profile.Role)
"@

    if (-not [string]::IsNullOrWhiteSpace($Profile.Location)) {
        $content += "`n**Location:** $($Profile.Location)"
    }

    $content += @"


## Goals

"@

    foreach ($goal in $Profile.Goals) {
        $content += "- $goal`n"
    }

    $content += @"

## Preferences

### Communication Style
- $($Preferences.CommunicationStyle)

### Work Priorities
"@

    foreach ($priority in $Preferences.Priorities) {
        $content += "- $priority`n"
    }

    if ($Preferences.Tools -and $Preferences.Tools.Count -gt 0) {
        $content += @"

### Tools & Technologies
"@
        foreach ($tool in $Preferences.Tools) {
            $content += "- $tool`n"
        }
    }

    if ($Company.Name) {
        $content += @"

## Companies/Projects

### $($Company.Name)
- **Description:** $($Company.Description)
- **Your Role:** $($Company.YourRole)
"@
    }

    $content += @"

---

Profile configured by HQ setup wizard.
Run ``/setup`` to update this file with Claude's help.
"@

    try {
        $content | Out-File -FilePath $agentsPath -Encoding UTF8 -Force
        return $true
    } catch {
        Write-ColorText "Error writing agents.md: $_" Red
        return $false
    }
}

function Show-GettingStarted {
    Write-Header "Getting Started with HQ"

    Write-Host "Your profile has been saved! Here's how to use HQ:"
    Write-Host ""

    Write-ColorText "BASIC USAGE" Yellow
    Write-Host ""
    Write-Host "  1. Open a terminal in your HQ folder"
    Write-Host "  2. Run: claude"
    Write-Host "  3. Start chatting with Claude!"
    Write-Host ""

    Write-ColorText "KEY COMMANDS" Yellow
    Write-Host ""
    Write-Host "  /nexttask     - Find your next task to work on"
    Write-Host "  /prd          - Plan a new project"
    Write-Host "  /run          - Execute workers for specific tasks"
    Write-Host "  /checkpoint   - Save your progress"
    Write-Host "  /help         - Get help with Claude Code"
    Write-Host ""

    Write-ColorText "LOCATIONS" Yellow
    Write-Host ""
    Write-Host "  HQ folder:        $HQDir"
    Write-Host "  Your profile:     $HQDir\agents.md"
    Write-Host "  Workers:          $HQDir\workers\"
    Write-Host "  Projects:         $HQDir\projects\"
    Write-Host ""

    Write-ColorText "NEXT STEPS" Yellow
    Write-Host ""
    Write-Host "  - Launch Claude and explore the commands"
    Write-Host "  - Create your first project with /prd"
    Write-Host "  - Check out the USER-GUIDE.md for more details"
    Write-Host ""
}

function Show-LaunchOptions {
    Write-Section "Launch Options"

    Write-Host "Would you like to:"
    Write-Host ""
    Write-Host "  1. Launch Claude now"
    Write-Host "  2. Open HQ folder"
    Write-Host "  3. Exit setup"
    Write-Host ""

    $choice = Read-UserInput "Enter your choice (1-3)" "1"

    switch ($choice) {
        "1" {
            Write-Host ""
            Write-ColorText "Launching Claude..." Green
            Set-Location $HQDir
            & claude
        }
        "2" {
            Write-Host ""
            Write-ColorText "Opening HQ folder..." Green
            Start-Process explorer.exe -ArgumentList $HQDir
        }
        default {
            Write-Host ""
            Write-ColorText "Setup complete! Run 'claude' in your HQ folder to get started." Green
        }
    }
}

function Show-SkippedMessage {
    Write-Header "Setup Skipped"

    Write-Host "No problem! You can configure HQ later by:"
    Write-Host ""
    Write-Host "  1. Opening a terminal in: $HQDir"
    Write-Host "  2. Running: claude"
    Write-Host "  3. Typing: /setup"
    Write-Host ""
    Write-Host "Or run this wizard again from the Start Menu."
    Write-Host ""

    $launch = Read-YesNo "Would you like to launch Claude now anyway?"
    if ($launch) {
        Set-Location $HQDir
        & claude
    }
}

# -----------------------------------------------------------------------------
# Main Wizard Flow
# -----------------------------------------------------------------------------

function Start-SetupWizard {
    # Check if HQ directory exists
    if (-not (Test-Path $HQDir)) {
        Write-ColorText "Error: HQ directory not found at $HQDir" Red
        Write-Host "Please reinstall HQ or specify the correct path."
        Read-Host "Press Enter to exit..."
        return
    }

    # Step 1: Welcome
    $continue = Show-Welcome

    if (-not $continue) {
        Show-SkippedMessage
        return
    }

    # Step 2: Collect profile
    $profile = Collect-Profile

    # Step 3: Collect preferences
    $preferences = Collect-Preferences

    # Step 4: Optional company info
    $company = Collect-CompanyInfo

    # Step 5: Write agents.md
    Write-Section "Saving Your Profile"

    $success = Write-AgentsMd -Profile $profile -Preferences $preferences -Company $company

    if ($success) {
        Write-ColorText "Profile saved successfully!" Green
    } else {
        Write-ColorText "There was an issue saving your profile, but you can edit agents.md manually." Yellow
    }

    # Step 6: Show getting started guide
    Show-GettingStarted

    # Step 7: Launch options
    Show-LaunchOptions
}

# Run the wizard
Start-SetupWizard
