#!/bin/bash
cd /vercel/share/v0-project
git status
echo "---"
git log --oneline -5
echo "---"
git add -A
git commit -m "rebuild leaderboard with DESIGN.md system"
git push origin leaderboards-screen-redesign
