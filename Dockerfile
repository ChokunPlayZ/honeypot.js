FROM node:18

WORKDIR /app/honeypotjs

COPY package*.json ./

RUN npm install

COPY . .

CMD [ "node", "." ]