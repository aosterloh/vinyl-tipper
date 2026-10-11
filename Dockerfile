FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY server.js ./
COPY public/ ./public/
COPY data/ ./data/

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

CMD ["node", "server.js"]
