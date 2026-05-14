FROM node:20-slim

RUN mkdir /frontend_app
WORKDIR /frontend_app

COPY package.json ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]
