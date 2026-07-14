"""
Playwright browser context session persistence.

Uses Playwright's built-in ``storage_state()`` to save and restore cookies
and localStorage across refresh cycles.
"""

import json
import logging
import os

from playwright.async_api import Browser, BrowserContext

logger = logging.getLogger("cookie-bot.session")


async def save_session(context: BrowserContext, path: str) -> None:
    """Save the current browser context state (cookies + localStorage) to disk.

    Args:
        context: The Playwright BrowserContext whose state to save.
        path: Filesystem path for the saved state JSON.
    """
    state = await context.storage_state()
    # Write atomically via temp file
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, path)
    logger.info("Session state saved to %s", path)


async def restore_session(browser: Browser, path: str) -> BrowserContext:
    """Create a new browser context, optionally restoring a saved session.

    If the saved state file exists, the new context is initialised with that
    state (cookies + localStorage are replayed before any navigation).

    Args:
        browser: The Playwright Browser instance.
        path: Filesystem path to the saved state JSON.

    Returns:
        A new BrowserContext with (if available) the saved session restored.
    """
    if os.path.exists(path):
        try:
            with open(path) as f:
                state = json.load(f)
            context = await browser.new_context(storage_state=state)
            logger.info("Session state restored from %s", path)
            return context
        except Exception as exc:
            logger.warning("Failed to restore session from %s: %s — starting fresh", path, exc)

    # No saved state or restore failed — start fresh
    context = await browser.new_context()
    logger.info("No saved session — starting fresh browser context")
    return context
