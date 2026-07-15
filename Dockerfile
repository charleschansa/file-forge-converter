FROM node:18-bullseye-slim

# Install necessary system dependencies for FFmpeg and Puppeteer (Chromium)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-liberation \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /usr/src/app

# Copy package info and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Ensure upload/output directories exist
RUN mkdir -p uploads output

# Expose the application port
EXPOSE 3700

# Start the application
CMD [ "npm", "start" ]
