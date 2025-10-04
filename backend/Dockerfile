FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# If you added "type":"module", nothing else to do.
# If not using ES modules, your index.js should use require().

EXPOSE 8080
CMD ["npm", "start"]
