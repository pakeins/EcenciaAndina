FROM node:22.22.3-slim AS build

WORKDIR /app
ARG PUBLIC_API_BASE_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN node -e "if (!process.env.PUBLIC_API_BASE_URL) throw new Error('PUBLIC_API_BASE_URL is required');"
ENV VITE_API_BASE_URL=$PUBLIC_API_BASE_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29.5-alpine
USER root
RUN apk upgrade --no-cache && apk del curl
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
