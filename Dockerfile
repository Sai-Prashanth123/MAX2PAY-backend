FROM node:20-alpine AS base

# Set working directory
WORKDIR /usr/src/app

# Install dependencies first (better layer caching)
COPY package*.json ./

# Use npm ci for reproducible installs; omit devDependencies for production
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Default environment (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=5001

# Expose API port
EXPOSE 5001

# Simple container-level healthcheck hitting the existing /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5001) + '/api/health', res => { if (res.statusCode >= 200 && res.statusCode < 500) process.exit(0); else process.exit(1); }).on('error', () => process.exit(1));"

# Use the production start script (no nodemon)
CMD [\"npm\", \"start\"]

