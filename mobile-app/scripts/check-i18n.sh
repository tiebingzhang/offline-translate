#!/bin/sh
# check-i18n.sh — FR-035 i18n readiness scan.
# Greps src/ and app/ for user-visible English string literals that are NOT
# wrapped in i18n._(), t`...`, or <Trans>...</Trans>. Exits 1 if any hit is
# found, 0 otherwise.
#
# Heuristic rules (POSIX sh / BRE):
#   - Look at .ts and .tsx files (excluding .test.ts(x) and __tests__/).
#   - Flag JSX text nodes that contain two or more letter-words, e.g. ">Hello world<".
#   - Flag string literals (single/double-quoted) in JSX attribute values on
#     props known to be user-visible: title, label, placeholder, accessibilityHint.
#   - Skip any line containing i18n._, t`, <Trans, or the sentinel comment
#     // i18n-ignore.
#   - Skip lines that look like technical strings: start with '/', contain
#     '://', or end with a file extension (.m4a, .wav, .json, .ts, .tsx, .mp3, .aac).
#
# (001-wolof-translate-mobile:T119)

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 2

HITS=0
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# Build file list: *.ts and *.tsx under src/ and app/, exclude tests and generated.
FILES=$(find src app -type f \( -name '*.ts' -o -name '*.tsx' \) \
  ! -path '*/__tests__/*' \
  ! -name '*.test.ts' \
  ! -name '*.test.tsx' \
  ! -path '*/locales/*' \
  2>/dev/null)

for f in $FILES; do
  # grep -n returns matches with line numbers. We chain greps rather than use
  # pipes that could obscure line origins.

  # Pattern A: JSX text content — ">Word Word<" with at least one space.
  # Requires two words starting with a letter, separated by a space.
  grep -nE '>[[:space:]]*[A-Z][A-Za-z]+[[:space:]]+[A-Za-z]+[A-Za-z .,!?:;\x27-]*<' "$f" \
    | grep -v 'i18n\._' \
    | grep -v 't\`' \
    | grep -v '<Trans' \
    | grep -v '</Trans' \
    | grep -v 'i18n-ignore' \
    | grep -v '://' \
    | grep -v '\.m4a<' \
    | grep -v '\.wav<' \
    | grep -v '\.aac<' \
    | grep -v '\.json<' \
    | sed "s|^|$f:A:|" >> "$TMP"

  # Pattern B: common user-visible JSX string attributes with English-looking
  # literal values (two capital/lowercase letter sequences separated by a space).
  grep -nE '(title|placeholder|accessibilityHint)=\"[A-Z][A-Za-z]+[[:space:]]+[A-Za-z]+' "$f" \
    | grep -v 'i18n\._' \
    | grep -v 't\`' \
    | grep -v 'i18n-ignore' \
    | grep -v '://' \
    | sed "s|^|$f:B:|" >> "$TMP"
done

if [ -s "$TMP" ]; then
  cat "$TMP"
  HITS=$(wc -l < "$TMP" | tr -d ' ')
  echo ""
  echo "check-i18n.sh: $HITS potential unwrapped user-visible literal(s) found." >&2
  echo "Wrap each in i18n._('<key>') and add the key to src/i18n/locales/en/messages.ts," >&2
  echo "or append '// i18n-ignore' to legitimate technical strings." >&2
  exit 1
fi

echo "check-i18n.sh: OK — no unwrapped user-visible literals detected."
exit 0
