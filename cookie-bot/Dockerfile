# cookie-bot — Playwright+Chromium sidecar for automated cookie refresh
#
# Base image: official Playwright Python image with Chromium bundled.
# ~1.2 GB total including system dependencies.

FROM mcr.microsoft.com/playwright/python:v1.53.0

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Python package into /app so "python -m cookie_bot.bot" works
COPY cookie_bot/ /app/cookie_bot/

# Default command: run the bot in normal (loop) mode
CMD ["python", "-m", "cookie_bot.bot"]
