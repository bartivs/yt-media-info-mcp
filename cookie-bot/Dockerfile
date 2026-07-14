# cookie-bot — Playwright+Chromium sidecar for automated cookie refresh
#
# Base image: official Playwright Python image with Chromium bundled.
# ~1.2 GB total including system dependencies.

FROM mcr.microsoft.com/playwright/python:v1.53.0

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install xvfb for headed Chromium (needed by --setup mode with CDP)
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Copy the Python package and entrypoint wrapper into /app
COPY cookie_bot/ /app/cookie_bot/

# Entrypoint wrapper starts Xvfb, exports DISPLAY, then runs the bot.
# Extra CLI args (--setup, --once) are appended automatically.
ENTRYPOINT ["/app/cookie_bot/xvfb_entrypoint.sh"]

# Default command: run the bot in normal (loop) mode (no args)
CMD []
