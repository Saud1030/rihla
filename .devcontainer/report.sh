#!/usr/bin/env bash
# Diagnostic report for the test site in this codespace. Secrets are hidden.
# Pushed to the "diagnostics" branch of this repository so the developer can read it.
#   bash .devcontainer/report.sh
cd "$(dirname "$0")/.."
R=/tmp/rihla-report.txt
{
  echo "time: $(date -Is)"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null)"
  echo "user: $(whoami)  node: $(node -v 2>/dev/null)  codespace: ${CODESPACE_NAME:-none}"
  echo "----- .env (secrets hidden)"
  sed -E 's/^(AUTH_SECRET|ADMIN_PASSWORD|MYFATOORAH_API_KEY|MYFATOORAH_WEBHOOK_SECRET)=.*/\1=(hidden)/' .env 2>&1
  echo "----- setup state"
  ls -la .devcontainer/.setup-done .next/BUILD_ID node_modules/.package-lock.json 2>&1
  echo "----- processes"
  ps -eo pid,user,etime,cmd | grep -E "next|mock-myfatoorah|setup.sh|start.sh" | grep -v grep
  echo "----- database"
  if [ -f .env ]; then
    set -a; . ./.env; set +a
    node -e "
const sql=require('postgres')(process.env.DATABASE_URL,{max:1,connect_timeout:5});
(async()=>{try{
  const t=await sql\`select table_name from information_schema.tables where table_schema='public' order by 1\`;
  console.log('tables:', t.map(r=>r.table_name).join(', ')||'(none)');
  for (const n of ['settings','locations','vehicles','routes','trips','bookings','chat_faqs','admin_users']) {
    try{const [r]=await sql.unsafe('select count(*)::int n from '+n);console.log(n, r.n);}catch(e){console.log(n,'ERROR',e.message);}
  }
}catch(e){console.log('DB ERROR:', e.code||'', e.message);} await sql.end({timeout:1});})()" 2>&1
  fi
  echo "----- http (inside the codespace)"
  PUB="${CODESPACE_NAME:-x}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  for p in / /ar /en /ar/routes /admin/login; do
    curl -s -o /dev/null -w "%{http_code} plain $p\n" "http://localhost:3000$p"
    curl -s -o /dev/null -w "%{http_code} forwarded $p\n" -H "X-Forwarded-Host: $PUB" -H "X-Forwarded-Proto: https" "http://localhost:3000$p"
  done
  curl -s -o /dev/null -w "%{http_code} mock\n" http://localhost:4010/__refunds
  echo "----- /tmp/site.log"
  tail -n 200 /tmp/site.log 2>&1
  for f in /tmp/migrate.log /tmp/seed.log /tmp/build.log; do echo "----- $f"; tail -n 40 "$f" 2>&1; done
  echo "----- /tmp/mock.log"
  tail -n 20 /tmp/mock.log 2>&1
  echo "----- codespace creation log"
  tail -n 150 /workspaces/.codespaces/.persistedshare/creation.log 2>&1
} > "$R" 2>&1

ROOT=$(pwd)
TMP=$(mktemp -d)
cp "$R" "$TMP/report.txt"
# push from this repository so its GitHub sign-in is used
( cd "$TMP" && git init -q && git add report.txt &&
  git -c user.name="codespace" -c user.email="codespace@localhost" commit -qm "diagnostics $(date -Is)" ) &&
git -C "$ROOT" fetch -q "$TMP" HEAD &&
git -C "$ROOT" push -qf origin "FETCH_HEAD:refs/heads/${REPORT_BRANCH:-diagnostics}" \
  && echo "📤 أُرسل تقرير التشخيص إلى المطوّر." || { echo "تعذّر إرسال التقرير. هذا محتواه:"; cat "$R"; }
rm -rf "$TMP"
