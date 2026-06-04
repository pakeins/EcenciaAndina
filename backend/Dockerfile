FROM node:22-slim

ENV NODE_ENV=production
ENV CONVENIOS_UPLOAD_DIR=/tmp/convenios
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
USER node

EXPOSE 3001
CMD ["node", "index.js"]
