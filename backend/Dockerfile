FROM node:22-alpine

# Crear directorio de trabajo
WORKDIR /usr/src/app

# Instalar dependencias
COPY package*.json ./
RUN npm install --production

# Copiar el resto del código
COPY . .

# Exponer el puerto del backend
EXPOSE 3001

# Iniciar la aplicación
CMD ["node", "index.js"]
