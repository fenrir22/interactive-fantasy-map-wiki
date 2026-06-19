FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --bin-links=true

COPY . .
RUN npm run build:editor

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --bin-links=true

COPY . .
COPY --from=builder /app/public/editor-assets ./public/editor-assets

EXPOSE 3000

CMD ["node", "server.js"]
