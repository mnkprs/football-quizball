#!/bin/bash

# Create and switch to the improve-2player-ui branch
cd /vercel/share/v0-project
git checkout -b improve-2player-ui
git add -A
git commit -m "Improve 2-player game UI with premium sporty styling

- Enhanced setup screen with styled player inputs and gradient buttons
- Redesigned board screen with glowing score cards and turn indicators
- Updated question screen with premium header and player indicators
- Improved result screen with dramatic win/loss announcements
- Redesigned final results screen with trophy and winner highlights
- Added green/red gradients for Higher/Lower buttons
- Implemented glowing effects and improved visual hierarchy across all screens"

echo "Branch 'improve-2player-ui' created and changes committed successfully!"
