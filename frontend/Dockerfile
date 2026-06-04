FROM node:22-slim AS build

WORKDIR /app
ARG PUBLIC_API_BASE_URL
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_VALUE
ARG PUBLIC_SUPABASE_PROJECT_ID
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci
COPY . .
RUN node -e "const { spawnSync } = require('node:child_process'); const required = ['PUBLIC_API_BASE_URL', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_VALUE']; for (const name of required) { if (!process.env[name]) throw new Error(name + ' is required'); } const env = { ...process.env, VITE_API_BASE_URL: process.env.PUBLIC_API_BASE_URL, VITE_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: process.env.PUBLIC_SUPABASE_VALUE, VITE_SUPABASE_PROJECT_ID: process.env.PUBLIC_SUPABASE_PROJECT_ID || '' }; const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env }); process.exit(result.status ?? 1);"

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
