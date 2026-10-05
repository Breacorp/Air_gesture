#!/usr/bin/env bash
# session-start.sh - Initialize session context
# Usage: ./session-start.sh --project "<name>" --objective "<objective>"

set -euo pipefail

PROJECT=""
OBJECTIVE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --objective) OBJECTIVE="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [[ -z "$PROJECT" || -z "$OBJECTIVE" ]]; then
  echo "Usage: $0 --project \"<name>\" --objective \"<objective>\""
  exit 1
fi

DATE=$(date '+%Y-%m-%d %H:%M')
HANDOFF_DIR="projects/$PROJECT/.knowledge"
HANDOFF_FILE="$HANDOFF_DIR/HANDOFF.md"

echo "🔧 Starting session for: $PROJECT"
echo ""

# Check for existing HANDOFF
if [[ -f "$HANDOFF_FILE" ]]; then
  echo "📋 Previous HANDOFF found:"
  head -10 "$HANDOFF_FILE"
  echo ""
  echo "---"
  echo ""
fi

# Create session log
MEMORY_DIR="memory"
mkdir -p "$MEMORY_DIR"
SESSION_LOG="$MEMORY_DIR/$(date +%Y-%m-%d).md"

if [[ ! -f "$SESSION_LOG" ]]; then
  cat > "$SESSION_LOG" << LOG
# Session Log - $(date '+%Y-%m-%d')

## $PROJECT
**Objective:** $OBJECTIVE
**Start:** $DATE

LOG
fi

echo "✅ Session started"
echo "   Project: $PROJECT"
echo "   Objective: $OBJECTIVE"
echo "   Log: $SESSION_LOG"
