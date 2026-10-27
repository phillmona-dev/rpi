FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_MAP_STYLE_URL
ARG NEXT_PUBLIC_DEMO_BANNER=false
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL NEXT_PUBLIC_DEMO_BANNER=$NEXT_PUBLIC_DEMO_BANNER NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S rpis && adduser -S rpis -G rpis
COPY --from=build /app/public ./public
COPY --from=build --chown=rpis:rpis /app/.next/standalone ./
COPY --from=build --chown=rpis:rpis /app/.next/static ./.next/static
USER rpis
EXPOSE 3000
CMD ["node", "server.js"]
