FROM node:22-alpine

# Crear directorio de trabajo
WORKDIR /usr/src/app

# Instalar dependencias
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copiar el resto del código explícitamente para evitar advertencias de seguridad
COPY index.js ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Exponer el puerto del backend
EXPOSE 3001

# Ejecutar como usuario no root por seguridad
USER node

# Iniciar la aplicación
CMD ["node", "index.js"]
