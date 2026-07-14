#!/bin/sh
# cookie-bot entrypoint wrapper
# Starts Xvfb virtual framebuffer (needed by headed Chromium in --setup mode),
# exports DISPLAY, then execs the bot so signals propagate correctly.

Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!
sleep 1
export DISPLAY=:99

exec python -m cookie_bot.bot "$@"
