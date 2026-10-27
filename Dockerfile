# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are baked into the browser bundle at build time
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# The build doesn't query the database, but the client needs a URL to load
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN npm run build

# ---------- run ----------
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# migrations + seed tooling
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts /app/package.json ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/db ./src/db
COPY --from=deps /app/node_modules ./node_modules
USER app
EXPOSE 3000
CMD ["node", "server.js"]
