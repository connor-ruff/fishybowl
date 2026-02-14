#!/usr/bin/env bash
set -euo pipefail

# ─── Fishybowl Deploy Script (for AWS Lightsail) ───
#
# Prerequisites (one-time setup on a fresh Lightsail instance):
#   1. Create a Lightsail instance ($5/mo, Amazon Linux 2 or Ubuntu)
#   2. Open port 80 in Lightsail Networking tab
#   3. SSH in and install Node.js 18+:
#        # Amazon Linux:
#          curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
#          sudo yum install -y nodejs
#        # Ubuntu:
#          curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
#          sudo apt-get install -y nodejs
#   4. Install pm2:
#        sudo npm install -g pm2
#   5. Clone the repo:
#        git clone <your-repo-url> ~/fishybowl
#   6. Run this script:
#        cd ~/fishybowl && bash deploy.sh
#   7. Set pm2 to start on boot:
#        pm2 startup   # follow the printed command
#        pm2 save
#
# After initial setup, re-deploy with:
#   cd ~/fishybowl && bash deploy.sh

cd "$(dirname "$0")"

echo "==> Pulling latest code..."
git pull

echo "==> Installing server dependencies..."
cd server && npm ci --omit=dev && cd ..

echo "==> Installing client dependencies & building..."
cd client && npm ci && npm run build && cd ..

echo "==> Starting/restarting with pm2..."
pm2 delete fishybowl 2>/dev/null || true
PORT=80 pm2 start server/index.js --name fishybowl --env production

echo "==> Done! App running on port 80"
PUBLIC_IP=$(curl -s --max-time 5 https://icanhazip.com 2>/dev/null || echo "")
echo "    Visit http://${PUBLIC_IP:-<your-lightsail-ip>}"
