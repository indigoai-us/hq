#!/bin/bash
# =============================================================================
# HQ Post-Install Setup Wizard (macOS/Linux)
# A friendly terminal-based wizard to configure HQ after installation
# =============================================================================

# Default HQ directory
HQ_DIR="${1:-$HOME/hq}"

# -----------------------------------------------------------------------------
# Colors
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${YELLOW}--- $1 ---${NC}"
    echo ""
}

print_color() {
    local color=$1
    shift
    echo -e "${color}$*${NC}"
}

read_input() {
    local prompt=$1
    local default=$2
    local result

    if [ -n "$default" ]; then
        echo -n "$prompt [$default]: "
    else
        echo -n "$prompt: "
    fi

    read -r result

    if [ -z "$result" ]; then
        echo "$default"
    else
        echo "$result"
    fi
}

read_yes_no() {
    local prompt=$1
    local default=$2
    local result

    if [ "$default" = "y" ]; then
        echo -n "$prompt [Y/n]: "
    else
        echo -n "$prompt [y/N]: "
    fi

    read -r result

    if [ -z "$result" ]; then
        result="$default"
    fi

    case "$result" in
        [Yy]* ) return 0;;
        * ) return 1;;
    esac
}

read_multiple() {
    local prompt=$1
    local help_text=${2:-"Enter each item on a new line. Press Enter on empty line when done."}

    echo "$prompt"
    echo -e "${GRAY}$help_text${NC}"
    echo ""

    local items=()
    while true; do
        echo -n "  > "
        read -r item

        if [ -z "$item" ]; then
            break
        fi

        items+=("$item")
    done

    # Return items as newline-separated string
    printf '%s\n' "${items[@]}"
}

# -----------------------------------------------------------------------------
# Wizard Steps
# -----------------------------------------------------------------------------

show_welcome() {
    clear
    print_header "Welcome to HQ!"

    echo "HQ is your personal AI operating system for orchestrating"
    echo "AI workers, projects, and content."
    echo ""
    echo "This wizard will help you set up your profile and get started."
    echo ""
    print_color "$YELLOW" "What we'll do:"
    echo "  1. Set up your profile (name, role, goals)"
    echo "  2. Configure your preferences"
    echo "  3. Show you how to get started"
    echo ""

    if read_yes_no "Ready to begin?" "y"; then
        return 0
    else
        return 1
    fi
}

collect_profile() {
    print_section "Your Profile"

    USER_NAME=$(read_input "What's your name?" "")
    USER_ROLE=$(read_input "What's your role/title?" "Professional")
    USER_LOCATION=$(read_input "Where are you located? (optional)" "")

    echo ""
    print_color "$YELLOW" "Great! Now let's set some goals."
    echo ""

    USER_GOALS=$(read_multiple "What are your main goals? (what do you want to achieve with HQ)")

    if [ -z "$USER_GOALS" ]; then
        USER_GOALS="Be more productive
Automate repetitive tasks
Build cool projects"
    fi
}

collect_preferences() {
    print_section "Your Preferences"

    echo "How would you describe your preferred communication style?"
    echo ""
    echo "  1. Direct and concise"
    echo "  2. Detailed explanations"
    echo "  3. Casual and friendly"
    echo "  4. Professional and formal"
    echo ""

    STYLE_CHOICE=$(read_input "Enter your choice (1-4)" "1")

    case "$STYLE_CHOICE" in
        1) COMM_STYLE="Direct and concise";;
        2) COMM_STYLE="Detailed explanations";;
        3) COMM_STYLE="Casual and friendly";;
        4) COMM_STYLE="Professional and formal";;
        *) COMM_STYLE="Direct and concise";;
    esac

    echo ""
    USER_PRIORITIES=$(read_multiple "What are your work priorities? (what matters most to you)")

    if [ -z "$USER_PRIORITIES" ]; then
        USER_PRIORITIES="Quality over speed
Clear communication"
    fi

    echo ""
    USER_TOOLS=$(read_multiple "What tools/technologies do you use? (optional)")
}

collect_company() {
    print_section "Company/Project (Optional)"

    if read_yes_no "Do you want to add a company or project?" "n"; then
        COMPANY_NAME=$(read_input "Company/Project name" "")
        COMPANY_DESC=$(read_input "Brief description" "")
        COMPANY_ROLE=$(read_input "Your role there" "")
    else
        COMPANY_NAME=""
        COMPANY_DESC=""
        COMPANY_ROLE=""
    fi
}

write_agents_md() {
    local agents_path="$HQ_DIR/agents.md"

    cat > "$agents_path" << AGENTS_EOF
# Agent Profile

Your personal AI profile. Claude uses this to understand your preferences, goals, and communication style.

## Personal Information

**Name:** $USER_NAME
**Role:** $USER_ROLE
AGENTS_EOF

    if [ -n "$USER_LOCATION" ]; then
        echo "**Location:** $USER_LOCATION" >> "$agents_path"
    fi

    cat >> "$agents_path" << AGENTS_EOF

## Goals

AGENTS_EOF

    echo "$USER_GOALS" | while read -r goal; do
        if [ -n "$goal" ]; then
            echo "- $goal" >> "$agents_path"
        fi
    done

    cat >> "$agents_path" << AGENTS_EOF

## Preferences

### Communication Style
- $COMM_STYLE

### Work Priorities
AGENTS_EOF

    echo "$USER_PRIORITIES" | while read -r priority; do
        if [ -n "$priority" ]; then
            echo "- $priority" >> "$agents_path"
        fi
    done

    if [ -n "$USER_TOOLS" ]; then
        cat >> "$agents_path" << AGENTS_EOF

### Tools & Technologies
AGENTS_EOF

        echo "$USER_TOOLS" | while read -r tool; do
            if [ -n "$tool" ]; then
                echo "- $tool" >> "$agents_path"
            fi
        done
    fi

    if [ -n "$COMPANY_NAME" ]; then
        cat >> "$agents_path" << AGENTS_EOF

## Companies/Projects

### $COMPANY_NAME
- **Description:** $COMPANY_DESC
- **Your Role:** $COMPANY_ROLE
AGENTS_EOF
    fi

    cat >> "$agents_path" << AGENTS_EOF

---

Profile configured by HQ setup wizard.
Run \`/setup\` to update this file with Claude's help.
AGENTS_EOF

    return 0
}

show_getting_started() {
    print_header "Getting Started with HQ"

    echo "Your profile has been saved! Here's how to use HQ:"
    echo ""

    print_color "$YELLOW" "BASIC USAGE"
    echo ""
    echo "  1. Open a terminal in your HQ folder"
    echo "  2. Run: claude"
    echo "  3. Start chatting with Claude!"
    echo ""

    print_color "$YELLOW" "KEY COMMANDS"
    echo ""
    echo "  /nexttask     - Find your next task to work on"
    echo "  /prd          - Plan a new project"
    echo "  /run          - Execute workers for specific tasks"
    echo "  /checkpoint   - Save your progress"
    echo "  /help         - Get help with Claude Code"
    echo ""

    print_color "$YELLOW" "LOCATIONS"
    echo ""
    echo "  HQ folder:        $HQ_DIR"
    echo "  Your profile:     $HQ_DIR/agents.md"
    echo "  Workers:          $HQ_DIR/workers/"
    echo "  Projects:         $HQ_DIR/projects/"
    echo ""

    print_color "$YELLOW" "NEXT STEPS"
    echo ""
    echo "  - Launch Claude and explore the commands"
    echo "  - Create your first project with /prd"
    echo "  - Check out the USER-GUIDE.md for more details"
    echo ""
}

show_launch_options() {
    print_section "Launch Options"

    echo "Would you like to:"
    echo ""
    echo "  1. Launch Claude now"
    echo "  2. Open HQ folder"
    echo "  3. Exit setup"
    echo ""

    CHOICE=$(read_input "Enter your choice (1-3)" "1")

    case "$CHOICE" in
        1)
            echo ""
            print_color "$GREEN" "Launching Claude..."
            cd "$HQ_DIR"
            exec claude
            ;;
        2)
            echo ""
            print_color "$GREEN" "Opening HQ folder..."
            if command -v open &> /dev/null; then
                open "$HQ_DIR"
            elif command -v xdg-open &> /dev/null; then
                xdg-open "$HQ_DIR"
            else
                echo "Please navigate to: $HQ_DIR"
            fi
            ;;
        *)
            echo ""
            print_color "$GREEN" "Setup complete! Run 'claude' in your HQ folder to get started."
            ;;
    esac
}

show_skipped_message() {
    print_header "Setup Skipped"

    echo "No problem! You can configure HQ later by:"
    echo ""
    echo "  1. Opening a terminal in: $HQ_DIR"
    echo "  2. Running: claude"
    echo "  3. Typing: /setup"
    echo ""
    echo "Or run this wizard again: ~/hq/setup-wizard.sh"
    echo ""

    if read_yes_no "Would you like to launch Claude now anyway?" "y"; then
        cd "$HQ_DIR"
        exec claude
    fi
}

# -----------------------------------------------------------------------------
# Main Wizard Flow
# -----------------------------------------------------------------------------

main() {
    # Check if HQ directory exists
    if [ ! -d "$HQ_DIR" ]; then
        print_color "$RED" "Error: HQ directory not found at $HQ_DIR"
        echo "Please reinstall HQ or specify the correct path."
        read -p "Press Enter to exit..."
        exit 1
    fi

    # Step 1: Welcome
    if ! show_welcome; then
        show_skipped_message
        exit 0
    fi

    # Step 2: Collect profile
    collect_profile

    # Step 3: Collect preferences
    collect_preferences

    # Step 4: Optional company info
    collect_company

    # Step 5: Write agents.md
    print_section "Saving Your Profile"

    if write_agents_md; then
        print_color "$GREEN" "Profile saved successfully!"
    else
        print_color "$YELLOW" "There was an issue saving your profile, but you can edit agents.md manually."
    fi

    # Step 6: Show getting started guide
    show_getting_started

    # Step 7: Launch options
    show_launch_options
}

# Run the wizard
main
