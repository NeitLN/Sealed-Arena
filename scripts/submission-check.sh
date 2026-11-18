#!/usr/bin/env bash
# Checks before submitting (docs/SUBMISSION.md). Reads only tracked files.
#   1. no forbidden claim in any tracked text file (same list as web/src/wording.test.ts)
#   2. the number of limits in README's "Security model and limitations" is EXPECTED_LIMITS
#   3. no value of a secret from .env in any tracked file (the public challenge agent key excepted)
#   4. no tracked file that .gitignore says should be ignored
#   5. every https link in README.md answers (2xx or 3xx)
# Usage: bash scripts/submission-check.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

failed=0
step() { printf '\n==> %s\n' "$1"; }
fail() { echo "FAIL: $1"; failed=1; }

# Tracked text files, without vendored code, raw logs of model output and lockfiles.
files() {
  git ls-files -z | tr '\0' '\n' |
    grep -vE '^(contracts/lib/|chain/genesis/vendor/|services/fuji-ops/vendor/|pnpm-lock.yaml$)' |
    grep -vE '\.(png|jpg|ico|woff2?)$'
}

step "forbidden claims"
FORBIDDEN='unbreakable|cannot be broken|absolutely (safe|secure)|100% (safe|secure)|decentrali[sz]|(block|stop)s? prompt injection|\bimmune\b|only avalanche|\b(steal|rob|loot)\b|\bprize\b|cash reward|không thể phá|an toàn tuyệt đối|phi tập trung|chặn prompt injection|miễn nhiễm|chỉ avalanche|cướp|trộm|giải thưởng'
# The wording test and this script list the words on purpose; transcripts quote attacker pages.
hits=$(files | grep -vE '^(web/src/wording.test.ts|scripts/submission-check.sh)$|/transcripts/' |
  xargs -d '\n' grep -nIiE "$FORBIDDEN" 2>/dev/null || true)
if [ -n "$hits" ]; then echo "$hits" | head -20; fail "forbidden wording"; else echo "PASS"; fi

step "numbered limits in README"
# Every limit under "Security model and limitations" is numbered; bump this when one is added.
EXPECTED_LIMITS=14
n=$(awk '/^## Security model and limitations/{on=1; next} /^## /{on=0} on && /^[0-9]+\. /' README.md | wc -l | tr -d ' ')
if [ "$n" = "$EXPECTED_LIMITS" ]; then echo "PASS ($n limits)"; else fail "README has $n numbered limits, expected $EXPECTED_LIMITS: update EXPECTED_LIMITS and docs together"; fi

step "secrets from .env"
if [ -f .env ]; then
  hits=$(node -e '
    const fs = require("fs"); const { execSync } = require("child_process");
    const env = fs.readFileSync(".env", "utf8").split(/\r?\n/)
      .filter((l) => /^[A-Z_0-9]+=/.test(l))
      .map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim().replace(/^0x/, "")])
      .filter(([k, v]) => v.length >= 16 && !k.endsWith("_ADDRESS") && !k.endsWith("_URL") && !k.startsWith("FUJI_ARENA_AGENT"));
    const list = execSync("git ls-files -z", { maxBuffer: 1e9 }).toString().split("\0").filter(Boolean);
    let n = 0;
    for (const f of list) {
      let s; try { s = fs.readFileSync(f, "utf8").toLowerCase(); } catch { continue; }
      for (const [k, v] of env) if (s.includes(v.toLowerCase())) { console.log(k + " in " + f); n++; }
    }
    process.exit(n ? 1 : 0);' 2>&1) || { echo "$hits"; fail "secret value in a tracked file"; }
  [ -z "$hits" ] && echo "PASS (names only are printed on a hit, never values)"
else
  echo "NOT RUN: no .env on this machine"
fi

step "tracked files that should be ignored"
ignored=$(git ls-files -ci --exclude-standard)
if [ -n "$ignored" ]; then echo "$ignored"; fail "ignored file is tracked"; else echo "PASS"; fi

step "links in README.md"
bad=0
# Snowtrace refuses scripted requests (403): open those links in a browser (docs/SUBMISSION.md).
for url in $(grep -oE 'https://[^ )>`"]+' README.md | grep -v 'snowtrace.io' | sort -u); do
  if [[ "$url" == */rpc ]]; then
    # JSON-RPC answers POST only.
    code=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' -H 'content-type: application/json'       --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' "$url" || echo 000)
  else
    code=$(curl -s -o /dev/null -L --max-time 15 -w '%{http_code}' "$url" || echo 000)
  fi
  case "$code" in 2*|3*) ;; *) echo "  $code $url"; bad=1 ;; esac
done
if [ "$bad" = 1 ]; then fail "a README link does not answer"; else echo "PASS"; fi

echo
if [ "$failed" = 0 ]; then echo "submission-check: PASS"; else echo "submission-check: FAIL"; exit 1; fi
