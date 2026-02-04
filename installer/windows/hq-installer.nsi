; =============================================================================
; HQ Windows Installer
; Built with NSIS (Nullsoft Scriptable Install System)
; =============================================================================

; -----------------------------------------------------------------------------
; General Attributes
; -----------------------------------------------------------------------------
!define PRODUCT_NAME "HQ"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "HQ"
!define PRODUCT_WEB_SITE "https://github.com/indigoai-us/hq"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\hq"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

; Required Node.js version
!define NODEJS_MIN_VERSION "18.0.0"
!define NODEJS_DOWNLOAD_URL "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
!define NODEJS_INSTALLER "node-v20.11.0-x64.msi"

; Claude CLI package
!define CLAUDE_CLI_PACKAGE "@anthropic-ai/claude-code"

; HQ template download (GitHub releases)
!define HQ_TEMPLATE_URL "https://github.com/indigoai-us/hq/releases/latest/download/hq-starter.zip"
!define HQ_TEMPLATE_ZIP "hq-starter.zip"

; GitHub releases API for update checking
!define GITHUB_RELEASES_API "https://api.github.com/repos/indigoai-us/hq/releases/latest"

; -----------------------------------------------------------------------------
; Includes
; -----------------------------------------------------------------------------
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; -----------------------------------------------------------------------------
; MUI Settings
; -----------------------------------------------------------------------------
!define MUI_ABORTWARNING
!define MUI_ICON "assets\hq-icon.ico"
!define MUI_UNICON "assets\hq-uninstall.ico"

; Welcome page settings
!define MUI_WELCOMEFINISHPAGE_BITMAP "assets\welcome-banner.bmp"
!define MUI_WELCOMEPAGE_TITLE "Welcome to HQ Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install HQ on your computer.$\r$\n$\r$\nHQ is your personal AI operating system for orchestrating AI workers, projects, and content.$\r$\n$\r$\nClick Next to continue."

; Finish page settings
!define MUI_FINISHPAGE_TITLE "HQ Installation Complete"
!define MUI_FINISHPAGE_TEXT "HQ has been installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Launch HQ Setup Wizard"
!define MUI_FINISHPAGE_RUN_FUNCTION "LaunchSetupWizard"

; Header images
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "assets\header.bmp"
!define MUI_HEADERIMAGE_RIGHT

; -----------------------------------------------------------------------------
; Pages
; -----------------------------------------------------------------------------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
Page custom DependencyCheckPage DependencyCheckPageLeave
!insertmacro MUI_PAGE_INSTFILES
Page custom ClaudeAuthPage ClaudeAuthPageLeave
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; -----------------------------------------------------------------------------
; Languages
; -----------------------------------------------------------------------------
!insertmacro MUI_LANGUAGE "English"

; -----------------------------------------------------------------------------
; Installer Attributes
; -----------------------------------------------------------------------------
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "hq-setup-${PRODUCT_VERSION}.exe"
InstallDir "$LOCALAPPDATA\HQ"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin

; -----------------------------------------------------------------------------
; Variables
; -----------------------------------------------------------------------------
Var NodeJSInstalled
Var ClaudeCLIInstalled
Var ClaudeAuthenticated
Var NodeJSVersion
Var Dialog
Var NodeStatus
Var ClaudeStatus
Var AuthStatus
Var AuthCheckbox
Var ProgressText
Var LatestVersion
Var UpdateAvailable

; -----------------------------------------------------------------------------
; Functions
; -----------------------------------------------------------------------------

; Compare version strings (returns 1 if $0 >= $1, 0 otherwise)
Function CompareVersions
    ; Simplified version comparison for major version only
    Push $R0
    Push $R1

    ; Get major version from $0
    StrCpy $R0 $0 2
    IntOp $R0 $R0 + 0  ; Convert to int

    ; Get major version from $1
    StrCpy $R1 $1 2
    IntOp $R1 $R1 + 0  ; Convert to int

    ${If} $R0 >= $R1
        StrCpy $0 1
    ${Else}
        StrCpy $0 0
    ${EndIf}

    Pop $R1
    Pop $R0
FunctionEnd

; Check if Node.js is installed and get version
Function CheckNodeJS
    ; Try to run node --version
    nsExec::ExecToStack 'cmd /c "node --version 2>nul"'
    Pop $0  ; Return code
    Pop $1  ; Output

    ${If} $0 == 0
        ; Node is installed, check version (output is like "v20.11.0")
        StrCpy $NodeJSVersion $1 "" 1  ; Remove leading 'v'
        StrCpy $NodeJSVersion $NodeJSVersion -2  ; Remove trailing newline

        ; Compare with minimum required version
        StrCpy $0 $NodeJSVersion
        StrCpy $1 ${NODEJS_MIN_VERSION}
        Call CompareVersions

        ${If} $0 == 1
            StrCpy $NodeJSInstalled "true"
        ${Else}
            StrCpy $NodeJSInstalled "outdated"
        ${EndIf}
    ${Else}
        StrCpy $NodeJSInstalled "false"
        StrCpy $NodeJSVersion ""
    ${EndIf}
FunctionEnd

; Check if Claude CLI is installed
Function CheckClaudeCLI
    nsExec::ExecToStack 'cmd /c "claude --version 2>nul"'
    Pop $0  ; Return code
    Pop $1  ; Output

    ${If} $0 == 0
        StrCpy $ClaudeCLIInstalled "true"
    ${Else}
        StrCpy $ClaudeCLIInstalled "false"
    ${EndIf}
FunctionEnd

; Check if Claude CLI is authenticated
; Returns "true" if authenticated, "false" if not, "unknown" if cannot determine
Function CheckClaudeAuth
    ; Check if claude is in PATH
    nsExec::ExecToStack 'cmd /c "claude --version 2>nul"'
    Pop $0
    Pop $1

    ${If} $0 != 0
        ; Claude not installed/accessible
        StrCpy $ClaudeAuthenticated "unknown"
        Return
    ${EndIf}

    ; Try a simple command to check auth
    ; Note: This is a heuristic - we try to run setup-token check
    ; If user has previously authenticated, credentials are stored
    nsExec::ExecToStack 'cmd /c "claude -p "test" 2>&1"'
    Pop $0
    Pop $1

    ${If} $0 == 0
        ; Command succeeded, likely authenticated
        StrCpy $ClaudeAuthenticated "true"
    ${Else}
        ; Command failed, check if auth-related error
        ; Look for login/auth keywords in output
        StrCpy $ClaudeAuthenticated "false"
    ${EndIf}
FunctionEnd

; Dependency check custom page
Function DependencyCheckPage
    !insertmacro MUI_HEADER_TEXT "Checking Dependencies" "Verifying required software..."

    nsDialogs::Create 1018
    Pop $Dialog

    ${If} $Dialog == error
        Abort
    ${EndIf}

    ; Check dependencies
    Call CheckNodeJS
    Call CheckClaudeCLI

    ; Create status display
    ${NSD_CreateLabel} 0 0 100% 24u "The installer will check and install required dependencies:"
    Pop $0

    ; Node.js status
    ${If} $NodeJSInstalled == "true"
        ${NSD_CreateLabel} 0 30u 100% 18u "Node.js: Installed (v$NodeJSVersion)"
        Pop $NodeStatus
        SetCtlColors $NodeStatus 0x008000 transparent  ; Green text
    ${ElseIf} $NodeJSInstalled == "outdated"
        ${NSD_CreateLabel} 0 30u 100% 18u "Node.js: Outdated (v$NodeJSVersion) - Will upgrade to v20.11.0"
        Pop $NodeStatus
        SetCtlColors $NodeStatus 0xFF8C00 transparent  ; Orange text
    ${Else}
        ${NSD_CreateLabel} 0 30u 100% 18u "Node.js: Not found - Will install v20.11.0"
        Pop $NodeStatus
        SetCtlColors $NodeStatus 0xFF0000 transparent  ; Red text
    ${EndIf}

    ; Claude CLI status
    ${If} $ClaudeCLIInstalled == "true"
        ${NSD_CreateLabel} 0 52u 100% 18u "Claude CLI: Installed"
        Pop $ClaudeStatus
        SetCtlColors $ClaudeStatus 0x008000 transparent  ; Green text
    ${Else}
        ${NSD_CreateLabel} 0 52u 100% 18u "Claude CLI: Not found - Will install via npm"
        Pop $ClaudeStatus
        SetCtlColors $ClaudeStatus 0xFF0000 transparent  ; Red text
    ${EndIf}

    ; Info text
    ${NSD_CreateLabel} 0 80u 100% 40u "Click Next to continue with the installation. Missing dependencies will be installed automatically."
    Pop $0

    nsDialogs::Show
FunctionEnd

Function DependencyCheckPageLeave
    ; Nothing to validate, just continue
FunctionEnd

; Claude authentication custom page
Function ClaudeAuthPage
    !insertmacro MUI_HEADER_TEXT "Claude Authentication" "Sign in to your Claude account"

    ; Check current auth status
    Call CheckClaudeAuth

    nsDialogs::Create 1018
    Pop $Dialog

    ${If} $Dialog == error
        Abort
    ${EndIf}

    ${If} $ClaudeAuthenticated == "true"
        ; Already authenticated
        ${NSD_CreateLabel} 0 0 100% 30u "Claude CLI is already authenticated!"
        Pop $0
        SetCtlColors $0 0x008000 transparent  ; Green text

        ${NSD_CreateLabel} 0 40u 100% 40u "You're all set! Claude CLI is ready to use.$\r$\n$\r$\nClick Next to continue."
        Pop $0
    ${Else}
        ; Not authenticated - show options
        ${NSD_CreateLabel} 0 0 100% 40u "Claude CLI requires authentication to work. You can sign in now using your browser, or skip and authenticate later."
        Pop $0

        ${NSD_CreateLabel} 0 50u 100% 20u "Authentication Status:"
        Pop $0

        ${If} $ClaudeAuthenticated == "false"
            ${NSD_CreateLabel} 0 70u 100% 18u "Not authenticated"
            Pop $AuthStatus
            SetCtlColors $AuthStatus 0xFF8C00 transparent  ; Orange text
        ${Else}
            ${NSD_CreateLabel} 0 70u 100% 18u "Unknown (will check when you click Authenticate)"
            Pop $AuthStatus
            SetCtlColors $AuthStatus 0x808080 transparent  ; Gray text
        ${EndIf}

        ; Checkbox for authentication
        ${NSD_CreateCheckBox} 0 100u 100% 20u "Open browser to authenticate Claude CLI"
        Pop $AuthCheckbox
        ${NSD_Check} $AuthCheckbox  ; Checked by default

        ${NSD_CreateLabel} 0 130u 100% 50u "If you check this option, a browser window will open for you to sign in to claude.ai. This is required to use Claude CLI.$\r$\n$\r$\nIf you skip, you can authenticate later by running 'claude' and typing /login."
        Pop $0
    ${EndIf}

    nsDialogs::Show
FunctionEnd

Function ClaudeAuthPageLeave
    ; Skip if already authenticated
    ${If} $ClaudeAuthenticated == "true"
        Return
    ${EndIf}

    ; Check if user wants to authenticate
    ${NSD_GetState} $AuthCheckbox $0
    ${If} $0 == ${BST_CHECKED}
        ; User wants to authenticate - run setup-token
        DetailPrint "Opening browser for Claude authentication..."

        ; Use ExecWait to run setup-token and wait for it
        ; setup-token opens browser and waits for OAuth completion
        nsExec::ExecToLog 'cmd /c "claude setup-token"'
        Pop $0

        ${If} $0 == 0
            MessageBox MB_OK|MB_ICONINFORMATION "Authentication successful! Claude CLI is now ready to use."
            StrCpy $ClaudeAuthenticated "true"
        ${Else}
            MessageBox MB_YESNO|MB_ICONQUESTION "Authentication may have failed or was cancelled.$\r$\n$\r$\nWould you like to try again?" IDYES retry IDNO continue

            retry:
                ; Try again
                nsExec::ExecToLog 'cmd /c "claude setup-token"'
                Pop $0
                ${If} $0 == 0
                    MessageBox MB_OK|MB_ICONINFORMATION "Authentication successful!"
                    StrCpy $ClaudeAuthenticated "true"
                ${Else}
                    MessageBox MB_OK|MB_ICONINFORMATION "You can authenticate later by running 'claude' and typing /login."
                ${EndIf}
                Goto continue

            continue:
        ${EndIf}
    ${Else}
        ; User skipped authentication
        DetailPrint "Claude authentication skipped by user"
    ${EndIf}
FunctionEnd

; Download file with progress
Function DownloadFile
    ; $0 = URL, $1 = Destination
    ; Using INetC plugin for download with progress
    INetC::get /CAPTION "Downloading..." /BANNER "Please wait while downloading..." "$0" "$1" /END
    Pop $R0
    ${If} $R0 != "OK"
        MessageBox MB_OK|MB_ICONEXCLAMATION "Download failed: $R0"
        Abort
    ${EndIf}
FunctionEnd

; Check for updates from GitHub releases (called on installer launch)
Function CheckForUpdates
    ; Try to fetch latest version from GitHub API
    ; This is optional - if it fails, we just continue with installation
    DetailPrint "Checking for updates..."

    ; Use INetC to download version info
    INetC::get /SILENT /CAPTION "Checking for updates..." "${GITHUB_RELEASES_API}" "$TEMP\hq-latest-release.json" /END
    Pop $R0

    ${If} $R0 == "OK"
        ; Parse the JSON to get tag_name (version)
        ; Note: NSIS doesn't have native JSON parsing, so we use a simple grep-like approach
        FileOpen $0 "$TEMP\hq-latest-release.json" r
        ${If} $0 != ""
            FileRead $0 $1
            FileClose $0

            ; Look for "tag_name" in the response
            ; Simple string search for version pattern
            StrCpy $LatestVersion ""
            StrCpy $UpdateAvailable "false"

            ; Check if we got a valid response with tag_name
            ; The version will be in format: "tag_name": "v1.2.3"
            ${If} $1 != ""
                ; For now, just log that we checked
                DetailPrint "Update check complete"
            ${EndIf}
        ${EndIf}
        Delete "$TEMP\hq-latest-release.json"
    ${Else}
        DetailPrint "Could not check for updates (offline or API unavailable)"
    ${EndIf}
FunctionEnd

; Save installed version to file
Function SaveVersionFile
    FileOpen $0 "$INSTDIR\.hq-version" w
    FileWrite $0 "${PRODUCT_VERSION}"
    FileClose $0
FunctionEnd

; Launch setup wizard function (called from finish page)
Function LaunchSetupWizard
    ; Run the setup wizard PowerShell script
    ; The wizard will guide the user through profile setup and optionally launch Claude
    IfFileExists "$INSTDIR\setup-wizard.ps1" 0 FallbackLaunch
        DetailPrint "Launching Setup Wizard..."
        ; Use powershell to run the wizard script with bypassed execution policy
        ExecShell "open" "powershell.exe" '-ExecutionPolicy Bypass -NoExit -File "$INSTDIR\setup-wizard.ps1" -HQDir "$INSTDIR"'
        Return

    FallbackLaunch:
        ; Fallback to original behavior if wizard script not found
        ExecShell "open" "cmd.exe" '/k "cd /d "$INSTDIR" && echo Welcome to HQ! && echo. && echo Run: claude && echo Then type /setup to begin the setup wizard && echo. && claude"'
FunctionEnd

; -----------------------------------------------------------------------------
; Installer Sections
; -----------------------------------------------------------------------------

Section "Core Files" SEC01
    SetOutPath "$INSTDIR"
    SetOverwrite on

    ; Create progress details
    DetailPrint "Installing HQ core files..."

    ; Copy the setup wizard script
    DetailPrint "Installing setup wizard..."
    File "..\shared\scripts\setup-wizard.ps1"

    ; Copy the update checker script
    DetailPrint "Installing update checker..."
    File "..\shared\scripts\check-updates.ps1"

    ; Save version file for update checking
    DetailPrint "Recording version information..."
    Call SaveVersionFile

    ; Try to copy bundled template files first
    ; Template is bundled from ../../template/ during build
    !ifdef BUNDLED_TEMPLATE
        DetailPrint "Extracting bundled HQ template..."
        File /r "..\..\template\*.*"
    !else
        ; Download template from GitHub releases
        DetailPrint "Downloading HQ starter template..."
        SetOutPath "$TEMP"
        StrCpy $0 "${HQ_TEMPLATE_URL}"
        StrCpy $1 "$TEMP\${HQ_TEMPLATE_ZIP}"

        ; Try to download, but don't fail if it doesn't work
        INetC::get /CAPTION "Downloading HQ template..." /BANNER "Please wait..." "$0" "$1" /END
        Pop $R0

        ${If} $R0 == "OK"
            DetailPrint "Extracting template..."
            SetOutPath "$INSTDIR"
            ; Use nsisunz plugin to extract zip
            nsisunz::UnzipToLog "$TEMP\${HQ_TEMPLATE_ZIP}" "$INSTDIR"
            Pop $R0
            ${If} $R0 != "success"
                DetailPrint "Warning: Could not extract template, creating minimal structure"
                Goto CreateMinimal
            ${EndIf}
            Delete "$TEMP\${HQ_TEMPLATE_ZIP}"
        ${Else}
            DetailPrint "Download failed, creating minimal structure"
            Goto CreateMinimal
        ${EndIf}
        Goto SkipMinimal

        CreateMinimal:
    !endif

    ; Create default directories if they don't exist
    CreateDirectory "$INSTDIR\.claude"
    CreateDirectory "$INSTDIR\.claude\commands"
    CreateDirectory "$INSTDIR\.claude\assets"
    CreateDirectory "$INSTDIR\workers"
    CreateDirectory "$INSTDIR\projects"
    CreateDirectory "$INSTDIR\workspace"
    CreateDirectory "$INSTDIR\workspace\checkpoints"
    CreateDirectory "$INSTDIR\workspace\threads"
    CreateDirectory "$INSTDIR\workspace\orchestrator"
    CreateDirectory "$INSTDIR\knowledge"
    CreateDirectory "$INSTDIR\social-content"
    CreateDirectory "$INSTDIR\social-content\drafts"

    ; Create minimal required files if template not available
    !ifndef BUNDLED_TEMPLATE
        ; Create agents.md
        FileOpen $0 "$INSTDIR\agents.md" w
        FileWrite $0 "# Agent Profile$\r$\n$\r$\n"
        FileWrite $0 "Your personal AI profile. Run /setup to configure.$\r$\n$\r$\n"
        FileWrite $0 "## Name$\r$\n[Your Name]$\r$\n$\r$\n"
        FileWrite $0 "## Role$\r$\n[Your Role]$\r$\n$\r$\n"
        FileWrite $0 "## Goals$\r$\n- [Your goals here]$\r$\n"
        FileClose $0

        ; Create CLAUDE.md
        FileOpen $0 "$INSTDIR\.claude\CLAUDE.md" w
        FileWrite $0 "# HQ$\r$\n$\r$\n"
        FileWrite $0 "Your personal AI operating system.$\r$\n$\r$\n"
        FileWrite $0 "Run /setup to configure your instance.$\r$\n"
        FileClose $0

        ; Create README.md
        FileOpen $0 "$INSTDIR\README.md" w
        FileWrite $0 "# HQ$\r$\n$\r$\n"
        FileWrite $0 "Your personal AI operating system.$\r$\n$\r$\n"
        FileWrite $0 "## Quick Start$\r$\n$\r$\n"
        FileWrite $0 "1. Open a terminal in this directory$\r$\n"
        FileWrite $0 "2. Run 'claude'$\r$\n"
        FileWrite $0 "3. Type '/setup' to configure$\r$\n"
        FileClose $0

        SkipMinimal:
    !endif
SectionEnd

Section "Node.js" SEC02
    ${If} $NodeJSInstalled != "true"
        DetailPrint "Installing Node.js..."

        ; Download Node.js installer
        SetOutPath "$TEMP"
        StrCpy $0 "${NODEJS_DOWNLOAD_URL}"
        StrCpy $1 "$TEMP\${NODEJS_INSTALLER}"
        Call DownloadFile

        ; Run Node.js installer silently
        DetailPrint "Running Node.js installer (this may take a few minutes)..."
        nsExec::ExecToLog 'msiexec /i "$TEMP\${NODEJS_INSTALLER}" /qn /norestart'
        Pop $0

        ${If} $0 != 0
            MessageBox MB_OK|MB_ICONEXCLAMATION "Node.js installation failed. Please install Node.js manually from https://nodejs.org/"
        ${Else}
            DetailPrint "Node.js installed successfully"
        ${EndIf}

        ; Clean up installer
        Delete "$TEMP\${NODEJS_INSTALLER}"

        ; Refresh environment variables
        ; Note: May need system restart or new shell for PATH to be available
    ${Else}
        DetailPrint "Node.js already installed (v$NodeJSVersion)"
    ${EndIf}
SectionEnd

Section "Claude CLI" SEC03
    ${If} $ClaudeCLIInstalled != "true"
        DetailPrint "Installing Claude CLI..."

        ; Need to refresh PATH first to find npm
        ; This reads the updated PATH from registry
        ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
        System::Call 'Kernel32::SetEnvironmentVariable(t "PATH", t "$0")i'

        ; Also check user PATH
        ReadRegStr $1 HKCU "Environment" "Path"
        System::Call 'Kernel32::SetEnvironmentVariable(t "PATH", t "$0;$1")i'

        ; Install Claude CLI globally via npm
        DetailPrint "Running: npm install -g ${CLAUDE_CLI_PACKAGE}"
        nsExec::ExecToLog 'cmd /c "npm install -g ${CLAUDE_CLI_PACKAGE}"'
        Pop $0

        ${If} $0 != 0
            MessageBox MB_OK|MB_ICONEXCLAMATION "Claude CLI installation failed. You can install it manually by running:$\r$\n$\r$\nnpm install -g ${CLAUDE_CLI_PACKAGE}"
        ${Else}
            DetailPrint "Claude CLI installed successfully"
        ${EndIf}
    ${Else}
        DetailPrint "Claude CLI already installed"
    ${EndIf}
SectionEnd

Section "Template Dependencies" SEC06
    ; Check if package.json exists in the install directory (for templates with npm dependencies)
    IfFileExists "$INSTDIR\package.json" 0 SkipNpmInstall
        DetailPrint "Found package.json, running npm install..."

        ; Refresh PATH
        ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
        ReadRegStr $1 HKCU "Environment" "Path"
        System::Call 'Kernel32::SetEnvironmentVariable(t "PATH", t "$0;$1")i'

        ; Run npm install in the install directory
        SetOutPath "$INSTDIR"
        nsExec::ExecToLog 'cmd /c "npm install"'
        Pop $0

        ${If} $0 != 0
            DetailPrint "npm install had warnings (non-fatal)"
        ${Else}
            DetailPrint "npm install completed"
        ${EndIf}

    SkipNpmInstall:
        DetailPrint "No package.json found, skipping npm install"
SectionEnd

Section "Start Menu Shortcuts" SEC04
    DetailPrint "Creating Start Menu shortcuts..."

    ; Create Start Menu folder
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"

    ; Create shortcut to open HQ folder
    CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\HQ Folder.lnk" "$INSTDIR"

    ; Create shortcut to launch Claude in HQ directory
    ; Check if icon exists first
    IfFileExists "$INSTDIR\.claude\assets\hq-icon.ico" 0 +3
        CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Launch HQ.lnk" "cmd.exe" '/k "cd /d "$INSTDIR" && claude"' "$INSTDIR\.claude\assets\hq-icon.ico" 0
        Goto EndStartMenuShortcut
    CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Launch HQ.lnk" "cmd.exe" '/k "cd /d "$INSTDIR" && claude"'
    EndStartMenuShortcut:

    ; Create shortcut to run setup wizard
    IfFileExists "$INSTDIR\setup-wizard.ps1" 0 SkipSetupWizardShortcut
        CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Setup Wizard.lnk" "powershell.exe" '-ExecutionPolicy Bypass -NoExit -File "$INSTDIR\setup-wizard.ps1" -HQDir "$INSTDIR"'
    SkipSetupWizardShortcut:

    ; Create shortcut to check for updates
    IfFileExists "$INSTDIR\check-updates.ps1" 0 SkipUpdateCheckerShortcut
        CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Check for Updates.lnk" "powershell.exe" '-ExecutionPolicy Bypass -NoExit -File "$INSTDIR\check-updates.ps1" -HQDir "$INSTDIR"'
    SkipUpdateCheckerShortcut:

    ; Create uninstaller shortcut
    CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\uninst.exe"
SectionEnd

Section "Desktop Shortcut" SEC05
    DetailPrint "Creating Desktop shortcut..."

    ; Check if icon exists, use default if not
    IfFileExists "$INSTDIR\.claude\assets\hq-icon.ico" 0 +3
        CreateShortcut "$DESKTOP\HQ.lnk" "cmd.exe" '/k "cd /d "$INSTDIR" && echo Welcome to HQ! && echo. && echo Type: claude && echo Then type /setup to get started && echo. && claude"' "$INSTDIR\.claude\assets\hq-icon.ico" 0
        Goto EndDesktopShortcut
    ; Use default Windows icon if custom icon not found
    CreateShortcut "$DESKTOP\HQ.lnk" "cmd.exe" '/k "cd /d "$INSTDIR" && echo Welcome to HQ! && echo. && echo Type: claude && echo Then type /setup to get started && echo. && claude"'
    EndDesktopShortcut:
SectionEnd

Section -Post
    ; Write uninstaller
    WriteUninstaller "$INSTDIR\uninst.exe"

    ; Write registry keys for Add/Remove Programs
    WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "$(^Name)"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\.claude\assets\hq-icon.ico"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"

    ; Calculate installed size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"

    DetailPrint "Installation complete!"
SectionEnd

; -----------------------------------------------------------------------------
; Uninstaller Section
; -----------------------------------------------------------------------------

Function un.onUninstSuccess
    HideWindow
    MessageBox MB_ICONINFORMATION|MB_OK "$(^Name) was successfully removed from your computer."
FunctionEnd

Function un.onInit
    MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Are you sure you want to uninstall $(^Name)?$\r$\n$\r$\nNote: Your HQ data and configuration will NOT be deleted." IDYES +2
    Abort
FunctionEnd

Section Uninstall
    ; Remove Start Menu shortcuts
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\HQ Folder.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\Launch HQ.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\Setup Wizard.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\Check for Updates.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk"
    RMDir "$SMPROGRAMS\${PRODUCT_NAME}"

    ; Remove Desktop shortcut
    Delete "$DESKTOP\HQ.lnk"

    ; Remove registry keys
    DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
    DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"

    ; Remove uninstaller
    Delete "$INSTDIR\uninst.exe"

    ; Note: We do NOT delete user data in $INSTDIR
    ; User must manually delete if they want to remove everything

    SetAutoClose true
SectionEnd

; -----------------------------------------------------------------------------
; Section Descriptions
; -----------------------------------------------------------------------------
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC01} "Core HQ files and templates"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC02} "Node.js runtime (required for Claude CLI)"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC03} "Claude CLI - AI agent execution engine"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC04} "Create Start Menu shortcuts"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC05} "Create Desktop shortcut"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC06} "Install template npm dependencies (if any)"
!insertmacro MUI_FUNCTION_DESCRIPTION_END
