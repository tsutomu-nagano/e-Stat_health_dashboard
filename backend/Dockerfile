FROM node:20-slim

RUN apt-get update && \
    apt-get install -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8787

CMD ["npm", "run", "dev"]
# # D1のローカルDBを初期化し、Wranglerを0.0.0.0でリッスンさせて起動
# CMD sh -c 'pnpm wrangler d1 migrations apply estat_health_history --local && pnpm wrangler dev --ip 0.0.0.0'