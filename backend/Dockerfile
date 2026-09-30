FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends cups cups-filters ghostscript fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
USER node
CMD ["node", "dist/main.js"]
