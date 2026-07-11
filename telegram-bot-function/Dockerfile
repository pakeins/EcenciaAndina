FROM mcr.microsoft.com/azure-functions/node:4-node20

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

# Create app directory
WORKDIR /home/site/wwwroot

# Copy dependency definitions
COPY package*.json ./

# Install dependecies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .
