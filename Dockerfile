FROM node:18.14.1-alpine3.17

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install --global pnpm

RUN pnpm install

COPY . .

RUN env NODE_ENV=production pnpm build:release

RUN npm install --global pm2

CMD pm2 start build/src/main.js --name eth-net-api --attach