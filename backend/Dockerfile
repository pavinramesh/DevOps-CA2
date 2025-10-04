FROM node:20-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install ALL dependencies (including prom-client)
RUN npm install --omit=dev

# Copy rest of the code
COPY . .

EXPOSE 8080
CMD ["npm", "start"]
