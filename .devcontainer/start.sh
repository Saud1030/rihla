#!/usr/bin/env bash
# Starts the site (port 3000) and the mock payment gateway (port 4010), repairing what it can first.
# Runs when the codespace starts and when you open it; safe to run by hand any time:
#   bash .devcontainer/start.sh
cd "$(dirname "$0")/.."

# codespaces made before this marker existed: built already means set up
[ -f .env ] && [ -f .next/BUILD_ID ] && touch .devcontainer/.setup-done

# first-time setup still running (or never ran)?
if [ ! -f .devcontainer/.setup-done ]; then
  if pgrep -f ".devcontainer/setup.sh" >/dev/null; then
    echo "⏳ التجهيز الأول ما زال يعمل (٣ إلى ٦ دقائق)... انتظر"
    while pgrep -f ".devcontainer/setup.sh" >/dev/null; do sleep 5; done
  fi
  if [ ! -f .devcontainer/.setup-done ]; then
    echo "==> تشغيل التجهيز الأول"
    bash .devcontainer/setup.sh || { echo "❌ فشل التجهيز."; bash .devcontainer/report.sh; exit 1; }
  fi
fi

set -a; . ./.env; set +a

# packages changed since the last install (after git pull)?
if ! cmp -s package-lock.json node_modules/.package-lock.json 2>/dev/null; then
  echo "==> تحديث الحزم"
  npm ci
fi

echo "==> فحص قاعدة البيانات"
DB_OK=0
for i in $(seq 1 45); do
  node -e "require('postgres')(process.env.DATABASE_URL,{max:1,connect_timeout:2})\`select 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))" && { DB_OK=1; break; }
  sleep 2
done
if [ "$DB_OK" = 1 ]; then
  # both are safe to repeat: missing tables or data get added, nothing is overwritten
  npm run --silent db:migrate >/tmp/migrate.log 2>&1 || { echo "⚠️ تعذّر تحديث الجداول:"; tail -20 /tmp/migrate.log; }
  npm run --silent db:seed >/tmp/seed.log 2>&1 || { echo "⚠️ تعذّرت البيانات الأساسية:"; tail -20 /tmp/seed.log; }
else
  echo "⚠️ قاعدة البيانات لا تستجيب (${DATABASE_URL%%@*}@...)."
fi

# build again when the code changed since the last build (after git pull)
HEAD_NOW=$(git rev-parse HEAD 2>/dev/null || echo none)
if [ ! -f .next/BUILD_ID ] || [ "$(cat .next/.built-commit 2>/dev/null)" != "$HEAD_NOW" ]; then
  echo "==> بناء الموقع (دقيقة إلى دقيقتين)"
  pkill -f "next start" 2>/dev/null || true
  if npm run build >/tmp/build.log 2>&1; then
    echo "$HEAD_NOW" > .next/.built-commit
  else
    echo "❌ فشل البناء:"; tail -40 /tmp/build.log
  fi
fi

if curl -fs -o /dev/null http://localhost:3000/ar; then
  echo "الموقع يعمل من قبل."
else
  pkill -f "tests/mock-myfatoorah.mjs" 2>/dev/null || true
  pkill -f "next start" 2>/dev/null || true
  # setsid + nohup: fully detached, so they keep running after this script ends
  setsid nohup node tests/mock-myfatoorah.mjs > /tmp/mock.log 2>&1 < /dev/null &
  setsid nohup npx next start -p 3000 > /tmp/site.log 2>&1 < /dev/null &
  for i in $(seq 1 60); do curl -fs -o /dev/null http://localhost:3000/ar && break; sleep 1; done
fi

# send a diagnostics report by itself whenever the site logs a server error
if [ -n "${CODESPACE_NAME:-}" ]; then
  for p in $(pgrep -f "watch-errors.sh" || true); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null; done
  setsid nohup bash .devcontainer/watch-errors.sh >/dev/null 2>&1 < /dev/null &
fi

# check the main pages the way the codespace link reaches them
PUB="${CODESPACE_NAME:-local}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
BAD=""
for p in /ar /en /ar/routes /ar/hourly /ar/contact /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Forwarded-Host: $PUB" -H "X-Forwarded-Proto: https" "http://localhost:3000$p")
  case "$code" in 2*|3*) ;; *) BAD="$BAD $p($code)";; esac
done

if [ -z "$BAD" ]; then
  echo ""
  echo "✅ الموقع يعمل: ${NEXT_PUBLIC_SITE_URL}"
  echo "   لوحة التحكم: ${NEXT_PUBLIC_SITE_URL}/admin   (admin@example.com / Rihla-Test-2026)"
  echo "   أو افتح تبويب PORTS واضغط رابط المنفذ 3000"
  setsid nohup bash .devcontainer/report.sh >/dev/null 2>&1 < /dev/null &
else
  echo "❌ صفحات فيها مشكلة:$BAD"
  echo "   آخر أسطر السجل:"
  tail -30 /tmp/site.log
  bash .devcontainer/report.sh
fi
