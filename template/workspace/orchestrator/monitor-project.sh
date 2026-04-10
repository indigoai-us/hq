#!/usr/bin/env bash
# monitor-project.sh — single-project dashboard for run-project.sh orchestrator
#
# Reads workspace/orchestrator/{project}/{state.json,executions/*.json,progress.txt}
# and renders a compact TUI widget.
#
# Usage:
#   monitor-project.sh <project>              # one-shot render
#   monitor-project.sh <project> --watch      # live dashboard (default 5s)
#   monitor-project.sh <project> -w -i 2      # custom interval
#   monitor-project.sh <project> --plain      # no colors / no box chars
set -euo pipefail

HQ_ROOT="${HQ_ROOT:-$HOME/HQ}"
ORCH_DIR="$HQ_ROOT/workspace/orchestrator"

# ---------- arg parse ----------
PROJECT=""
WATCH=0
INTERVAL=5
PLAIN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -w|--watch)    WATCH=1; shift ;;
    -i|--interval) INTERVAL="$2"; shift 2 ;;
    --plain)       PLAIN=1; shift ;;
    -h|--help)
      sed -n '2,15p' "$0"; exit 0 ;;
    -*)
      echo "unknown flag: $1" >&2; exit 2 ;;
    *)
      PROJECT="$1"; shift ;;
  esac
done

[[ -z "$PROJECT" ]] && { echo "usage: monitor-project.sh <project> [-w] [-i N] [--plain]" >&2; exit 2; }

STATE_FILE="$ORCH_DIR/$PROJECT/state.json"
EXEC_DIR="$ORCH_DIR/$PROJECT/executions"
PROGRESS_FILE="$ORCH_DIR/$PROJECT/progress.txt"

[[ -f "$STATE_FILE" ]] || { echo "no state.json for project '$PROJECT' at $STATE_FILE" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# ---------- presentation helpers ----------
if [[ $PLAIN -eq 1 ]] || [[ ! -t 1 && $WATCH -eq 0 ]]; then
  C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BLUE=""; C_CYAN=""; C_MAGENTA=""
  TL="+"; TR="+"; BL="+"; BR="+"; HZ="-"; VT="|"; LT="+"; RT="+"; BLK_FULL="#"; BLK_EMPTY="."
else
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'; C_MAGENTA=$'\033[35m'
  TL="╭"; TR="╮"; BL="╰"; BR="╯"; HZ="─"; VT="│"; LT="├"; RT="┤"
  BLK_FULL="█"; BLK_EMPTY="░"
fi

WIDTH=72
INNER=$((WIDTH - 2))

iso_to_epoch() {
  local iso="$1"
  [[ -z "$iso" || "$iso" == "null" ]] && { echo 0; return; }
  # strip trailing Z, feed to BSD date
  date -juf "%Y-%m-%dT%H:%M:%S" "${iso%Z}" "+%s" 2>/dev/null || echo 0
}

human_duration() {
  local sec="$1"
  [[ -z "$sec" || "$sec" -le 0 ]] && { echo "—"; return; }
  local h=$(( sec / 3600 ))
  local m=$(( (sec % 3600) / 60 ))
  local s=$(( sec % 60 ))
  if   (( h > 0 )); then printf "%dh%02dm" "$h" "$m"
  elif (( m > 0 )); then printf "%dm%02ds" "$m" "$s"
  else                   printf "%ds" "$s"
  fi
}

progress_bar() {
  local done="$1" total="$2" width="$3"
  (( total <= 0 )) && total=1
  local filled=$(( done * width / total ))
  (( filled > width )) && filled=$width
  local empty=$(( width - filled ))
  local bar=""
  while (( filled-- > 0 )); do bar+="$BLK_FULL"; done
  while (( empty-- > 0 )); do bar+="$BLK_EMPTY"; done
  printf "%s" "$bar"
}

# visible width of a string (strips ANSI + counts characters, not bytes)
visible_width() {
  local n
  n=$(LC_ALL=en_US.UTF-8 printf "%s" "$1" | sed -E $'s/\033\\[[0-9;]*m//g' | LC_ALL=en_US.UTF-8 wc -m)
  # wc -m on macOS emits leading whitespace — strip it
  printf "%d" "$(( n + 0 ))"
}

# print a row inside the box: │ <text padded to INNER> │
row() {
  local text="$1"
  local vlen
  vlen=$(visible_width "$text")
  local pad=$(( INNER - vlen - 2 ))
  (( pad < 0 )) && pad=0
  printf "%s %s%*s %s\n" "$VT" "$text" "$pad" "" "$VT"
}

hrule() {
  local ch="$1" left="$2" right="$3"
  printf "%s" "$left"
  local i=0
  while (( i++ < INNER )); do printf "%s" "$ch"; done
  printf "%s\n" "$right"
}

status_badge() {
  case "$1" in
    in_progress) printf "%s●%s %sIN PROGRESS%s" "$C_GREEN" "$C_RESET" "$C_BOLD$C_GREEN" "$C_RESET" ;;
    completed)   printf "%s✓%s %sCOMPLETED%s"   "$C_CYAN"  "$C_RESET" "$C_BOLD$C_CYAN"  "$C_RESET" ;;
    paused)      printf "%s❚❚%s %sPAUSED%s"     "$C_YELLOW" "$C_RESET" "$C_BOLD$C_YELLOW" "$C_RESET" ;;
    failed)      printf "%s✗%s %sFAILED%s"      "$C_RED"   "$C_RESET" "$C_BOLD$C_RED"   "$C_RESET" ;;
    *)           printf "%s?%s %s%s%s"          "$C_DIM"   "$C_RESET" "$C_BOLD" "${1^^}" "$C_RESET" ;;
  esac
}

# ---------- render ----------
render() {
  local state project status started updated total completed failed in_progress
  state=$(cat "$STATE_FILE")
  project=$(jq -r '.project // "?"' <<<"$state")
  status=$(jq -r '.status // "unknown"' <<<"$state")
  started=$(jq -r '.started_at // ""' <<<"$state")
  updated=$(jq -r '.updated_at // ""' <<<"$state")
  total=$(jq -r '.progress.total // 0' <<<"$state")
  completed=$(jq -r '.progress.completed // 0' <<<"$state")
  failed=$(jq -r '.progress.failed // 0' <<<"$state")
  in_progress=$(jq -r '.progress.in_progress // 0' <<<"$state")

  local now start_epoch upd_epoch elapsed eta_str avg_per avg_ready
  now=$(date +%s)
  start_epoch=$(iso_to_epoch "$started")
  upd_epoch=$(iso_to_epoch "$updated")
  elapsed=$(( now - start_epoch ))
  (( start_epoch == 0 )) && elapsed=0

  if (( completed > 0 && upd_epoch > start_epoch )); then
    avg_per=$(( (upd_epoch - start_epoch) / completed ))
    local remaining=$(( total - completed ))
    local eta_sec=$(( avg_per * remaining ))
    eta_str=$(human_duration "$eta_sec")
    avg_ready=$(human_duration "$avg_per")
  else
    eta_str="—"
    avg_ready="—"
  fi

  local pct=0
  (( total > 0 )) && pct=$(( completed * 100 / total ))

  # --- header ---
  hrule "$HZ" "$TL" "$TR"
  row "$(printf "%sRALPH ORCHESTRATOR%s  %s%s%s" "$C_BOLD" "$C_RESET" "$C_MAGENTA" "$project" "$C_RESET")"
  row "$(status_badge "$status")"
  hrule "$HZ" "$LT" "$RT"

  # --- progress ---
  local bar_width=$(( INNER - 18 ))  # leave room for "  [bar] NN/NN NNN%"
  local bar
  bar=$(progress_bar "$completed" "$total" "$bar_width")
  row "$(printf "%s%s%s %s%2d/%2d%s %s(%3d%%)%s" "$C_GREEN" "$bar" "$C_RESET" "$C_BOLD" "$completed" "$total" "$C_RESET" "$C_DIM" "$pct" "$C_RESET")"

  local stats="$(printf "%sin-progress%s %d   %sfailed%s %s%d%s" \
    "$C_DIM" "$C_RESET" "$in_progress" \
    "$C_DIM" "$C_RESET" \
    "$( ((failed>0)) && printf "%s" "$C_RED" || printf "%s" "$C_RESET")" "$failed" "$C_RESET")"
  row "$stats"

  # --- timing ---
  row "$(printf "%selapsed%s %-10s  %savg/story%s %-8s  %seta%s %s" \
    "$C_DIM" "$C_RESET" "$(human_duration "$elapsed")" \
    "$C_DIM" "$C_RESET" "$avg_ready" \
    "$C_DIM" "$C_RESET" "$eta_str")"

  # --- current task + phase ---
  hrule "$HZ" "$LT" "$RT"
  local cur_count
  cur_count=$(jq -r '.current_tasks | length' <<<"$state")
  if (( cur_count == 0 )); then
    row "$(printf "%sno active task%s" "$C_DIM" "$C_RESET")"
  else
    # iterate current tasks (usually 1)
    local i=0
    while (( i < cur_count )); do
      local tid tstarted cur_phase_worker cur_phase_status phases_done phases_total phase_line exec_file
      tid=$(jq -r ".current_tasks[$i].id" <<<"$state")
      tstarted=$(jq -r ".current_tasks[$i].started_at // \"\"" <<<"$state")
      exec_file="$EXEC_DIR/$tid.json"

      if [[ -f "$exec_file" ]]; then
        cur_phase_worker=$(jq -r '[.phases[] | select(.status=="in_progress")][0].worker // (.phases[-1].worker // "?")' "$exec_file")
        cur_phase_status=$(jq -r '[.phases[] | select(.status=="in_progress")][0].status // "idle"' "$exec_file")
        phases_done=$(jq -r '[.phases[] | select(.status=="completed")] | length' "$exec_file")
        phases_total=$(jq -r '.phases | length' "$exec_file")
      else
        cur_phase_worker="starting"; cur_phase_status="pending"
        phases_done=0; phases_total=3
      fi

      local tsec=0
      local tstart_epoch
      tstart_epoch=$(iso_to_epoch "$tstarted")
      (( tstart_epoch > 0 )) && tsec=$(( now - tstart_epoch ))

      row "$(printf "%s▸%s %s%s%s  %s(%s)%s" "$C_YELLOW" "$C_RESET" "$C_BOLD" "$tid" "$C_RESET" "$C_DIM" "$(human_duration "$tsec")" "$C_RESET")"
      row "$(printf "  %sphase%s %d/%d  %s→%s %s%s%s %s[%s]%s" \
        "$C_DIM" "$C_RESET" "$phases_done" "$phases_total" \
        "$C_DIM" "$C_RESET" \
        "$C_CYAN" "$cur_phase_worker" "$C_RESET" \
        "$C_DIM" "$cur_phase_status" "$C_RESET")"
      i=$(( i + 1 ))
    done
  fi

  # --- recent completions (last 5) ---
  if (( completed > 0 )); then
    hrule "$HZ" "$LT" "$RT"
    row "$(printf "%sRECENT%s" "$C_DIM" "$C_RESET")"
    # parse progress.txt tail for completed lines
    if [[ -f "$PROGRESS_FILE" ]]; then
      local line id title dur_raw
      while IFS= read -r line; do
        # [ts] US-NNN: title — completed (NNNs) [sha] (n/N)
        id=$(printf "%s" "$line" | sed -E 's/^\[[^]]+\] (US-[0-9]+):.*/\1/')
        title=$(printf "%s" "$line" | sed -E 's/^\[[^]]+\] US-[0-9]+: (.*) — (completed|failed).*/\1/')
        dur_raw=$(printf "%s" "$line" | sed -nE 's/.*\(([0-9]+)s\).*/\1/p')
        local dur_h
        dur_h=$(human_duration "${dur_raw:-0}")
        # truncate title to fit
        local max_title=$(( INNER - 20 ))
        (( ${#title} > max_title )) && title="${title:0:max_title}…"
        row "$(printf "  %s✓%s %s%-6s%s %-*s %s%6s%s" \
          "$C_GREEN" "$C_RESET" \
          "$C_BOLD" "$id" "$C_RESET" \
          "$max_title" "$title" \
          "$C_DIM" "$dur_h" "$C_RESET")"
      done < <(grep -E '] US-[0-9]+:.*(completed|failed) \([0-9]+s\)' "$PROGRESS_FILE" 2>/dev/null | tail -n 5)
    fi
  fi

  # --- failures / regression gates ---
  local reg_failed
  reg_failed=$(jq -r '[.regression_gates[]? | select(.passed==false)] | length' <<<"$state")
  if (( failed > 0 || reg_failed > 0 )); then
    hrule "$HZ" "$LT" "$RT"
    if (( failed > 0 )); then
      local failed_ids
      failed_ids=$(jq -r '[.failed_tasks[].id] | join(", ")' <<<"$state")
      row "$(printf "%s✗ FAILED TASKS%s  %s" "$C_RED" "$C_RESET" "$failed_ids")"
    fi
    if (( reg_failed > 0 )); then
      local reg_after
      reg_after=$(jq -r '[.regression_gates[] | select(.passed==false) | .after_story] | join(", ")' <<<"$state")
      row "$(printf "%s⚠ REGRESSION GATE FAILED%s  after %s" "$C_RED" "$C_RESET" "$reg_after")"
    fi
  fi

  # --- footer ---
  hrule "$HZ" "$BL" "$BR"
  if [[ $WATCH -eq 1 ]]; then
    printf "%supdated %s · refresh %ss · ^C to exit%s\n" "$C_DIM" "$(date +%H:%M:%S)" "$INTERVAL" "$C_RESET"
  fi
}

# ---------- main loop ----------
if [[ $WATCH -eq 1 ]]; then
  trap 'printf "\n"; exit 0' INT TERM
  # hide cursor
  printf '\033[?25l'
  trap 'printf "\n\033[?25h"; exit 0' INT TERM EXIT
  while :; do
    printf '\033[2J\033[H'  # clear screen + home
    render
    sleep "$INTERVAL"
  done
else
  render
fi
