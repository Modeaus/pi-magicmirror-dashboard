#!/bin/bash
# Patch MM's bundled weathergov provider for the mirror wall panel's weak wifi.
# Re-run after any MagicMirror update.
#
# Two stock bugs on a lossy link:
#  1) undici throws `TypeError: fetch failed` with no `.cause.code`, so
#     #categorizeError returns isRetryable:false -> init gives up after ONE failure.
#  2) the weather node_helper calls provider.start() once, right after
#     `await provider.initialize()`. weathergov's initialize() swallows errors and
#     reschedules itself, so start() runs while this.fetcher is still null (no-op).
#     When a later retry finally builds the fetcher, nothing ever calls
#     startPeriodicFetch() -> the module is stuck on "Loading …" forever.
set -e
F=~/MagicMirror/defaultmodules/weather/providers/weathergov.js
cp "$F" "$F.orig.$(date +%s)" 2>/dev/null || true

python3 - "$F" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
before = s

# --- bug 1: generic fallback -> retryable, and many more retries ---
s = s.replace(
    'return {\n\t\t\tmessage: error.message || "Unknown error",\n\t\t\tisRetryable: false\n\t\t};',
    'return {\n\t\t\tmessage: error.message || "Unknown error",\n\t\t\tisRetryable: true // patched: transient "fetch failed" (no .code) must keep retrying\n\t\t};'
)
s = s.replace('this.initRetryCount < 5', 'this.initRetryCount < 30')
s = s.replace('(attempt ${this.initRetryCount}/5)', '(attempt ${this.initRetryCount}/30)')

# --- bug 2: after a retry builds the fetcher, actually start it ---
s = s.replace(
    '\t\ttry {\n\t\t\tawait this.#fetchWeatherGovURLs();\n\t\t\tthis.#initializeFetcher();\n\t\t\tthis.initRetryCount = 0; // Reset on success',
    '\t\ttry {\n\t\t\tconst wasRetry = this.initRetryCount > 0;\n\t\t\tawait this.#fetchWeatherGovURLs();\n\t\t\tthis.#initializeFetcher();\n\t\t\tthis.initRetryCount = 0; // Reset on success\n\t\t\tif (wasRetry && this.fetcher) this.fetcher.startPeriodicFetch(); // patched: node_helper already ran start() on a null fetcher'
)

if s == before:
    print("NO CHANGE (already patched or source differs)")
else:
    open(p, "w").write(s)
    print("patched OK")
PY
echo "--- verify ---"
grep -n "isRetryable: true // patched\|initRetryCount < 30\|wasRetry && this.fetcher" "$F" || true
