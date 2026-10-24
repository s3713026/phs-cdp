# PHS CDP BFF — Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY src/ ./src/
COPY workspaceConfig.json ./

EXPOSE 3001

CMD ["node", "src/server.js"]
