FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --force

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
