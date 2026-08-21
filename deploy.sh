#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Selleryd/eish-site-live.git}"
BRANCH="${BRANCH:-main}"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="${WORK_DIR:-$HOME/Desktop/eish-site-git-upload}"

if [ ! -f "$SOURCE_DIR/index.html" ]; then
  echo "ERROR: index.html is missing from $SOURCE_DIR"
  exit 1
fi

rm -rf "$WORK_DIR"
git clone "$REPO_URL" "$WORK_DIR"
cd "$WORK_DIR"
git checkout -B "$BRANCH"
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R "$SOURCE_DIR"/. .
rm -rf .gitignore 2>/dev/null || true
find . -name '.DS_Store' -delete
touch .nojekyll

git config user.name "Selleryd"
git config user.email "selleryd@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy."
else
  git commit -m "Deploy rebuilt Eish Group Management website"
fi

git remote set-url origin "https://selleryd@github.com/Selleryd/eish-site-live.git"
git push -u origin "$BRANCH" --force

echo "Deployment pushed to GitHub."
