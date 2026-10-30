FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --force

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
