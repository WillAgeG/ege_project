#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UIKIT="$(cd "$ROOT/../vektor-ui-kit" && pwd)"
JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"

cd "$ROOT"

cp ux-ui/components/kit.js "$UIKIT/components/kit.js"
cp ux-ui/styles/base.css "$UIKIT/styles/base.css"
cp frontend/styles/marketplace.css ux-ui/styles/marketplace.css
cp frontend/styles/marketplace.css "$UIKIT/styles/marketplace.css"

diff -q ux-ui/components/kit.js "$UIKIT/components/kit.js"
diff -q ux-ui/styles/base.css "$UIKIT/styles/base.css"
diff -q frontend/styles/marketplace.css ux-ui/styles/marketplace.css
diff -q frontend/styles/marketplace.css "$UIKIT/styles/marketplace.css"

python3 -c '
p = "frontend/app.js"
raw = open(p, "rb").read()
bare = raw.replace(b"\r\n", b"").count(b"\n")
if bare:
    norm = raw.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    open(p, "wb").write(norm)
    bare = norm.replace(b"\r\n", b"").count(b"\n")
print("app.js crlf bare_lf=" + str(bare))
assert bare == 0
'

if grep -rnE "#13794b|fetch\(|EventSource|WebSocket|EGE\.api|EGE\.tutors|Вывести 95%|(^|[^0-9])5%:" ux-ui/components/ ux-ui/styles/ "$UIKIT/components/" "$UIKIT/styles/" "$UIKIT/index.html" 2>/dev/null; then
  echo "ERROR: forbidden token found in UI-Kit" >&2
  exit 1
fi

run_jsc() {
  local dir="$1"
  local script="$2"
  local marker="$3"
  local extra_env="${4:-}"
  local out
  out=$(cd "$dir" && env $extra_env "$JSC" "$script" 2>&1)
  printf '%s\n' "$out"
  if printf '%s\n' "$out" | grep -qE "^Error:|ASSERTION FAILED"; then
    echo "ERROR: JSC test failed ($script)" >&2
    exit 1
  fi
  if ! printf '%s\n' "$out" | grep -qF "$marker"; then
    echo "ERROR: missing marker $marker ($script)" >&2
    exit 1
  fi
}

echo "=== UIKIT ==="
run_jsc "$UIKIT" "tests/check_uikit.js" "UIKIT_SMOKE_TESTS_OK"

echo "=== APP ==="
run_jsc "$ROOT" "tests/check_app.js" "APP_SMOKE_TESTS_OK"

echo "=== APP_AGY ==="
run_jsc "$ROOT" "tests/check_app.js" "APP_SMOKE_TESTS_OK" "EGE_ANTIGRAVITY=1"

echo "=== PYTEST ==="
"$ROOT/.venv/bin/python" -m pytest -q

echo "ALL_CHECKS_OK"
