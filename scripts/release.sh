#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/release.sh <patch|minor|major>

BUMP="${1:-}"
if [[ -z "$BUMP" || ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: scripts/release.sh <patch|minor|major>"
  exit 1
fi

# 1. Confirm working tree is clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

# 2. Run typecheck and tests
echo "Running typecheck..."
npm run typecheck

echo "Running tests..."
npm test

# 3. Bump version in package.json (no git tag — we tag manually)
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)
echo "Bumped to $NEW_VERSION"

# 4. Add changelog placeholder for the new version
DATE=$(date +%Y-%m-%d)
HEADER="## ${NEW_VERSION} — ${DATE}"
sed -i '' "s/^# Changelog$/# Changelog\n\n${HEADER}\n\n_TODO: Add release notes here._/" CHANGELOG.md

# 5. Commit, tag, and push
git add package.json CHANGELOG.md
git commit -m "chore: release ${NEW_VERSION}"
git tag "$NEW_VERSION"

echo "Pushing commit and tag..."
git push && git push origin "$NEW_VERSION"

echo "Done! GitHub Actions will build the release for ${NEW_VERSION}."
