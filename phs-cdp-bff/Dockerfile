# PHS CDP BFF — Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/
COPY workspaceConfig.json ./

# Fix file permissions — files copied from macOS may be 600 (owner-only)
RUN find /app/src -type f -exec chmod 644 {} \; \
 && find /app/src -type d -exec chmod 755 {} \;

EXPOSE 3001

CMD ["node", "src/server.js"]
