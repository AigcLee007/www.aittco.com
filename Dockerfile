ARG NODE_BASE_IMAGE=node:20-slim
FROM ${NODE_BASE_IMAGE} AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps

COPY package.json package-lock.json* ./
COPY src/server/prisma ./src/server/prisma

RUN npm config set registry https://registry.npmjs.org \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 300000 \
  && npm config set audit false \
  && npm config set fund false \
  && npm ci --include=optional \
  && npm install --no-save --include=optional --os=linux --cpu=x64 sharp

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3333
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/server/prisma ./src/server/prisma
COPY --from=builder /app/src/common ./src/common
COPY --from=builder /app/src/server/services ./src/server/services
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/docker ./docker

RUN rm -f ./docker/print-model-route-summary.ts \
  && chmod +x ./docker/start-frontend.sh

USER nextjs

EXPOSE 3333

CMD ["./docker/start-frontend.sh"]
