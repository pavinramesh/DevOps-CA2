# Use lightweight Node.js image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json first (for caching layer)
COPY package*.json ./

# Install all production dependencies (includes prom-client)
RUN npm install --omit=dev

# Copy rest of the application code
COPY . .

# Expose port 8080 (same as in index.js and k8s service)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
