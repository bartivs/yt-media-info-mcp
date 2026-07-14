FROM python:3.12-slim

WORKDIR /app

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
