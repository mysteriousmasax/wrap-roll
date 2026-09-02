FROM node:22-bookworm-slim

WORKDIR /app

# Install build tools required for native C++ SQLite compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install dependencies and rebuild better-sqlite3 from source for Linux
RUN npm install
RUN npm install --prefix server
RUN cd server && npm rebuild better-sqlite3 --build-from-source

# Copy all source files
COPY . .

# Build the client frontend
RUN npm run build

# Runtime environment settings
ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "server/index.js"]