#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UIKIT="$(cd "$ROOT/../vektor-ui-kit" && pwd)"

"$ROOT/scripts/site_ctl.sh" restart
"$UIKIT/scripts/uikit_ctl.sh" restart
"$ROOT/scripts/design_ctl.sh" restart

for port in 8770 8772 8773; do
  code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/")"
  echo "${port}=${code}"
  if [ "$code" != "200" ]; then
    exit 1
  fi
done

if curl -sD - -o /dev/null -H "Accept-Encoding: gzip" "http://127.0.0.1:8770/app.js" | grep -qi "content-encoding: gzip"; then
  echo "gzip_8770=ok"
else
  echo "gzip_8770=missing"
  exit 1
fi
