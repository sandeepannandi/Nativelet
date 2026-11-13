#!/usr/bin/env bash
# Bounded UI hierarchy capture for emulator checks. A transient null root is
# recorded and retried; if no valid hierarchy is captured, the caller fails.
set -u
OUT="$1"
NAME="$2"
REMOTE="${3:-/sdcard/gyro-$NAME.xml}"
TARGET="$OUT/$NAME.xml"
ATTEMPTS=3
mkdir -p "$OUT"
ATTEMPT_LOG="$OUT/$NAME.ui-dump-attempts.txt"
: > "$ATTEMPT_LOG"
for attempt in $(seq 1 "$ATTEMPTS"); do
  rm -f "$TARGET"
  adb shell rm -f "$REMOTE" >/dev/null 2>&1 || true
  DUMP_LOG="$OUT/$NAME.dump-$attempt.txt"
  PULL_LOG="$OUT/$NAME.pull-$attempt.txt"
  if timeout 12 adb shell uiautomator dump "$REMOTE" >"$DUMP_LOG" 2>&1; then
    if timeout 10 adb pull "$REMOTE" "$TARGET" >"$PULL_LOG" 2>&1; then
      if python3 - "$TARGET" <<'PY'
import sys
import xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
if root.tag != 'hierarchy' or not any(True for _ in root.iter('node')):
    raise SystemExit('invalid UI hierarchy')
PY
      then
        echo "ui-dump PASS name=$NAME attempt=$attempt" | tee -a "$ATTEMPT_LOG"
        exit 0
      fi
    fi
  fi
  echo "ui-dump attemptFAIL name=$NAME attempt=$attempt" | tee -a "$ATTEMPT_LOG"
  sleep 2
done
echo "ui-dump FAIL name=$NAME attempts=$ATTEMPTS" | tee -a "$ATTEMPT_LOG"
exit 1
