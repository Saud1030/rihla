#!/usr/bin/env bash
# First-time setup of the test site: packages, .env, database, demo data, build.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing packages"
npm ci

if [ -n "${CODESPACE_NAME:-}" ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  SITE="https://${CODESPACE_NAME}-3000.${DOMAIN}"
  MOCK="https://${CODESPACE_NAME}-4010.${DOMAIN}"
else
  SITE="http://localhost:3000"
  MOCK="http://localhost:4010"
fi

if [ ! -f .env ]; then
  echo "==> Writing .env (test settings, mock payment gateway)"
  cat > .env <<ENV
DATABASE_URL=postgres://postgres:postgres@${DB_HOST:-db}:5432/rihla
NEXT_PUBLIC_SITE_URL=${SITE}
AUTH_SECRET=$(openssl rand -hex 32)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Rihla-Test-2026
# mock MyFatoorah (tests/mock-myfatoorah.mjs): no real money, Pay / Decline buttons
MYFATOORAH_API_KEY=test-mf-token-123
MYFATOORAH_API_BASE=http://localhost:4010
MYFATOORAH_WEBHOOK_SECRET=test-mf-webhook-secret
MOCK_PUBLIC_URL=${MOCK}
# the public Codespaces domain in front of the app
SERVER_ACTIONS_ALLOWED_ORIGINS=*.app.github.dev,*.githubpreview.dev
ENV
fi
set -a; . ./.env; set +a

echo "==> Waiting for the database"
for i in $(seq 1 60); do
  node -e "require('postgres')(process.env.DATABASE_URL,{max:1,connect_timeout:2})\`select 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))" && break
  sleep 2
  [ "$i" = 60 ] && { echo "❌ قاعدة البيانات لا تستجيب"; exit 1; }
done

echo "==> Database tables, Saudi destinations, demo bookings"
npm run db:migrate
npm run db:seed
npx tsx scripts/demo-bookings.ts
npx tsx scripts/demo-routes.ts
# demo bank account so the bank-transfer option can be tried (example IBAN, not a real account)
node -e "
const sql=require('postgres')(process.env.DATABASE_URL,{max:1});
(async()=>{for(const [k,v] of [['bank_enabled','1'],['bank_name','بنك تجريبي'],['bank_account_name','شركة رحلة للنقل (تجربة)'],['bank_iban','SA0380000000608010167519']])
await sql\`insert into settings(key,value) values(\${k},\${v}) on conflict (key) do update set value=excluded.value\`;await sql.end();})()"

echo "==> Building the site"
npm run build
git rev-parse HEAD > .next/.built-commit 2>/dev/null || true

touch .devcontainer/.setup-done
echo ""
echo "Done. Site: ${SITE}   Admin: ${SITE}/admin   (admin@example.com / Rihla-Test-2026)"
