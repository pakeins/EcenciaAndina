FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 8080

CMD ["npx", "vite", "preview", "--port", "8080", "--host", "0.0.0.0"]

