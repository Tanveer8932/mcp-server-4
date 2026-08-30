FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV MCP_TRANSPORT=streamable-http
ENV MCP_HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# Mount a Railway Volume at /data in the service settings (not via Dockerfile VOLUME)
ENV GOOGLE_TOKEN_STORE_PATH=/data/tokens.json

CMD ["node", "dist/index.js"]
