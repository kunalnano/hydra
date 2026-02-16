#!/bin/bash
# launch-hydra-swarm.sh — Spawn Claude Code agent team for HYDRA
# Usage: ./launch-hydra-swarm.sh [session-name]

SESSION_NAME="${1:-hydra-swarm}"
PROJECT_DIR="$HOME/Documents/ai/myAIProjects/Alfred/hydra"

export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

tmux kill-session -t "$SESSION_NAME" 2>/dev/null

echo "⚡ Launching HYDRA swarm..."
echo "   Project: $PROJECT_DIR"
echo "   Session: $SESSION_NAME"
echo "   Agent Teams: ENABLED"
echo ""

cd "$PROJECT_DIR"

exec tmux new-session -s "$SESSION_NAME" "cd $PROJECT_DIR && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude"
