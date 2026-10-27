#!/usr/bin/env bash
# Codespace only: when the site logs a server error, send the diagnostics report automatically
# (at most once a minute), so problems reach the developer without anyone copying logs.
cd "$(dirname "$0")/.."
last=0
tail -n0 -F /tmp/site.log 2>/dev/null | while IFS= read -r line; do
  case "$line" in
    *"⨯"*|*"Error:"*|*"startPayment failed"*)
      now=$(date +%s)
      if [ $((now - last)) -ge 60 ]; then
        last=$now
        sleep 5 # let the whole error reach the log
        bash .devcontainer/report.sh >/dev/null 2>&1
      fi ;;
  esac
done
