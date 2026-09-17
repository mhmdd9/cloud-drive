FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
ENV CHECKPOINT_DISABLE=1
ENV AWS_EC2_METADATA_DISABLED=true

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM base AS development
RUN chown node:node /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN npx prisma generate
ENV NODE_ENV=development
ENV PORT=3000
USER node
EXPOSE 3000

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
