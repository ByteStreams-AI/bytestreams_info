#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_PATH=$(readlink -f -- "${BASH_SOURCE[0]}")
SCRIPT_DIR=$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE_TEMPLATE="$PROJECT_ROOT/../dialtone_sm/DialTone_Cold_Call_Template.md"
TARGET_TEMPLATE="$PROJECT_ROOT/src/lib/server/prompts/DialTone_Cold_Call_Template.md"
PASSED_CHECKS=()
CURRENT_STEP="initialization"
PNPM=()

print_heading() {
	printf '\n==> %s\n' "$1"
}

pass() {
	PASSED_CHECKS+=("$1")
	printf 'PASS: %s\n' "$1"
}

fail() {
	printf '\nFAIL: %s\n' "$1" >&2
	exit 1
}

on_error() {
	local exit_code=$?
	printf '\nFAIL: %s (exit code %s)\n' "$CURRENT_STEP" "$exit_code" >&2
	printf 'The template was not committed, pushed, or deployed.\n' >&2
	exit "$exit_code"
}

trap on_error ERR

cd "$PROJECT_ROOT"

print_heading "Checking prerequisites"
CURRENT_STEP="checking pnpm"
if command -v pnpm >/dev/null; then
	PNPM=(pnpm)
elif command -v corepack >/dev/null; then
	PNPM=(corepack pnpm)
else
	fail "Neither pnpm nor Corepack is installed or available on PATH"
fi
"${PNPM[@]}" --version
pass "pnpm is available"

CURRENT_STEP="checking the editorial source template"
[[ -f "$SOURCE_TEMPLATE" ]] || fail "Editorial source not found: $SOURCE_TEMPLATE"
[[ -s "$SOURCE_TEMPLATE" ]] || fail "Editorial source is empty: $SOURCE_TEMPLATE"
pass "editorial source exists and is not empty"

CURRENT_STEP="checking the bundled template directory"
[[ -d "$(dirname -- "$TARGET_TEMPLATE")" ]] || fail "Bundled template directory is missing"
pass "bundled template destination exists"

print_heading "Synchronizing canonical template"
CURRENT_STEP="copying the editorial template"
cp -- "$SOURCE_TEMPLATE" "$TARGET_TEMPLATE"

CURRENT_STEP="verifying byte-for-byte template equality"
cmp -s -- "$SOURCE_TEMPLATE" "$TARGET_TEMPLATE" || fail "Bundled template does not match the editorial source"
pass "templates match byte for byte"
printf 'Source: %s\n' "$SOURCE_TEMPLATE"
printf 'Target: %s\n' "$TARGET_TEMPLATE"
printf 'Size:   %s bytes\n' "$(wc -c < "$TARGET_TEMPLATE")"

print_heading "Running ESLint"
CURRENT_STEP="pnpm lint"
"${PNPM[@]}" lint
pass "ESLint completed"

print_heading "Running Svelte and TypeScript checks"
CURRENT_STEP="pnpm check"
"${PNPM[@]}" check
pass "Svelte and TypeScript checks completed"

print_heading "Running test suite"
CURRENT_STEP="pnpm test"
"${PNPM[@]}" test
pass "test suite completed"

print_heading "Building Cloudflare production bundle"
CURRENT_STEP="pnpm build"
"${PNPM[@]}" build
pass "production build completed"

print_heading "Validating Cloudflare packaging and AI binding"
CURRENT_STEP="Wrangler dry run"
DRY_RUN_OUTPUT=$(mktemp)
trap 'rm -f -- "$DRY_RUN_OUTPUT"' EXIT
"${PNPM[@]}" wrangler deploy --dry-run 2>&1 | tee "$DRY_RUN_OUTPUT"

CURRENT_STEP="verifying the env.AI binding"
grep -Eq 'env\.AI[[:space:]]+AI' "$DRY_RUN_OUTPUT" || fail "Wrangler dry run did not list the env.AI binding"
pass "Wrangler dry run completed"
pass "env.AI binding is present"

print_heading "Verification summary"
for check in "${PASSED_CHECKS[@]}"; do
	printf 'PASS: %s\n' "$check"
done

printf '\nTemplate update and all %s verifications completed successfully.\n' "${#PASSED_CHECKS[@]}"
printf 'Review the template change with:\n  git diff -- %q\n' "$TARGET_TEMPLATE"
printf 'No commit, push, or deployment was performed.\n'
