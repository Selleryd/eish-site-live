#!/bin/bash
set -euo pipefail
REPO_URL="${1:-https://github.com/Selleryd/eish-site-live.git}"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="${TMPDIR:-/tmp}/eish-site-deploy-$$"
rm -rf "$WORK_DIR"
git clone "$REPO_URL" "$WORK_DIR"
find "$WORK_DIR" -mindepth 1 -maxdepth 1 ! -name ".git" -exec rm -rf {} +
rsync -a --exclude ".git" "$SOURCE_DIR"/ "$WORK_DIR"/
cd "$WORK_DIR"
git config user.name "Selleryd"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy."
  exit 0
fi
git commit -m "Deploy rebuilt Eish Group Management website"
git remote set-url origin "https://selleryd@github.com/Selleryd/eish-site-live.git"
git push -u origin main --force-with-lease
echo "Deployment pushed to GitHub."
