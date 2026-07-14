FROM python:3.12-slim

WORKDIR /app

# yt-dlp requires a JavaScript runtime to solve YouTube's nsig/EJS challenges.
# Deno is the recommended default and is auto-detected by yt-dlp on PATH.
# Without it, only thumbnail images are returned -> "Requested format is not available".
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install requirements first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Expose the FastAPI port (internal to the compose network)
EXPOSE 8000

# Run uvicorn; the service is called by the Node MCP server over HTTP.
# Use --host 0.0.0.0 so it is reachable from the Node container on the bridge network.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
