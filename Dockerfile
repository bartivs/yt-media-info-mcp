FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy source code
COPY src/ ./src/
COPY env.example ./.env

# Expose MCP HTTP port (SSE mode)
EXPOSE 9423

# Run the MCP server (stdio by default, SSE if ENABLE_SSE=1)
CMD ["node", "src/index.js"]
