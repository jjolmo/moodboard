#!/bin/bash
export PATH="/home/cidwel/.nvm/versions/node/v24.12.0/bin:/home/cidwel/.cargo/bin:$PATH"

# Kill any leftover instances (exclude ourselves)
pkill -f "target/debug/simple-moodboard" 2>/dev/null
fuser -k 1420/tcp 2>/dev/null
sleep 0.3

cd /home/cidwel/projects/simple-moodboard
exec npx tauri dev
