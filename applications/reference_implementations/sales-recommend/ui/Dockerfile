# Sales Recommend UI — Multi-stage Docker build
# Next.js 14 on ECS Fargate

FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built output and production deps
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# public/ is optional — copy only if it exists
RUN mkdir -p ./public
COPY --from=builder /app/public* ./public/

EXPOSE 3000

CMD ["node", "server.js"]
