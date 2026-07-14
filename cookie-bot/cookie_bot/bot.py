"""
cookie-bot — Playwright+Chromium sidecar for automated cookie refresh.

Orchestrates the cookie refresh lifecycle:
  1. Parse CLI args to determine mode (normal, --setup, --once)
  2. Discover configured providers
  3. Run the refresh loop (or setup mode, or one-shot)

Entry point: python -m cookie_bot.bot
"""

import asyncio
import logging
import os
import sys

from cookie_bot.cli import parse_args
from cookie_bot.providers import get_configured_providers
from cookie_bot.session import save_session, restore_session
from cookie_bot.cookie_writer import write_cookie_file

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("cookie-bot")

# ---------------------------------------------------------------------------
# Paths (shared volume mount point)
# ---------------------------------------------------------------------------
DATA_DIR = os.environ.get("COOKIE_BOT_DATA_DIR", "/data")
STATE_FILE = os.path.join(DATA_DIR, "browser-state.json")
COOKIE_FILE = os.environ.get(
    "COOKIE_BOT_COOKIE_FILE",
    os.path.join(DATA_DIR, "cookies.txt"),
)

# Interval between refresh cycles (seconds)
REFRESH_INTERVAL = int(os.environ.get("BOT_REFRESH_INTERVAL", "14400"))  # 4 hours


async def refresh_cycle(browser_context) -> list[dict]:
    """Run one full refresh cycle across all configured providers.

    Returns a combined list of Playwright cookie dicts from all providers
    that logged in successfully.
    """
    providers = get_configured_providers()
    if not providers:
        logger.info("No configured providers — nothing to refresh")
        return []

    all_cookies = []
    page = await browser_context.new_page()

    for provider in providers:
        logger.info("Refreshing cookies for %s …", provider.name)
        try:
            ok = await provider.login(page, browser_context)
        except Exception as exc:
            logger.warning("%s login failed with exception: %s", provider.name, exc)
            ok = False

        if ok:
            logger.info("%s login successful — extracting cookies", provider.name)
            cookies = await browser_context.cookies()
            # Filter to the provider's declared domains
            provider_cookies = [
                c for c in cookies
                if any(domain in c.get("domain", "") for domain in provider.cookie_domains)
            ]
            all_cookies.extend(provider_cookies)
        else:
            logger.warning("%s login failed — skipping", provider.name)

    await page.close()
    return all_cookies


async def run_loop():
    """Enter the infinite refresh loop.

    On each cycle:
      1. Launch a Playwright browser (Chromium headless)
      2. Restore saved session state if available
      3. Run a refresh cycle across all configured providers
      4. Save session state if any login succeeded
      5. Write the combined Netscape cookie file atomically
      6. Close browser, sleep for REFRESH_INTERVAL, repeat
    """
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        while True:
            logger.info("Starting refresh cycle …")
            browser = await pw.chromium.launch(headless=True)
            context = await restore_session(browser, STATE_FILE)

            try:
                all_cookies = await refresh_cycle(context)

                if all_cookies:
                    # Save session state for next cycle
                    await save_session(context, STATE_FILE)
                    # Write Netscape cookie file atomically
                    write_cookie_file(all_cookies, COOKIE_FILE)
                    logger.info("Wrote %d cookies to %s", len(all_cookies), COOKIE_FILE)
                else:
                    logger.info("No cookies collected this cycle — cookie file unchanged")
            finally:
                await context.close()
                await browser.close()

            logger.info("Cycle complete — sleeping %d seconds …", REFRESH_INTERVAL)
            await asyncio.sleep(REFRESH_INTERVAL)


async def run_once():
    """Run a single refresh cycle then exit (--once mode)."""
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        logger.info("One-shot mode: running single refresh cycle")
        browser = await pw.chromium.launch(headless=True)
        context = await restore_session(browser, STATE_FILE)

        try:
            all_cookies = await refresh_cycle(context)
            if all_cookies:
                await save_session(context, STATE_FILE)
                write_cookie_file(all_cookies, COOKIE_FILE)
                logger.info("Wrote %d cookies to %s", len(all_cookies), COOKIE_FILE)
            else:
                logger.info("No cookies collected this cycle")
        finally:
            await context.close()
            await browser.close()


async def run_setup():
    """Launch Chromium with CDP for interactive login (--setup mode)."""
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        logger.info("Setup mode: launching Chromium with remote debugging …")
        browser = await pw.chromium.launch(
            headless=False,
            args=["--remote-debugging-port=9222"],
        )
        context = await browser.new_context()

        # Print connection instructions
        print("=" * 60)
        print("cookie-bot — Interactive Setup Mode")
        print("=" * 60)
        print("")
        print("Chromium is running with remote debugging on port 9222.")
        print("")
        print("To connect and complete login:")
        print("  1. Open Chrome/Chromium on your host machine")
        print('  2. Navigate to chrome://inspect')
        print("  3. Click 'Configure…' and add localhost:9222")
        print("  4. Click 'Inspect' under the remote target")
        print("")
        print("For each configured provider, log in interactively.")
        print("When you're done, return here and press Enter to save session.")
        print("")
        print("Press Enter after completing login in the browser …")
        await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)

        # Collect cookies and save session
        all_cookies = await context.cookies()
        await save_session(context, STATE_FILE)
        write_cookie_file(all_cookies, COOKIE_FILE)
        logger.info("Saved session state and %d cookies to %s", len(all_cookies), COOKIE_FILE)

        await context.close()
        await browser.close()
        print("Setup complete. You can now start the cookie-bot in normal mode.")


async def main():
    args = parse_args()

    if args.setup:
        await run_setup()
    elif args.once:
        await run_once()
    else:
        await run_loop()


if __name__ == "__main__":
    asyncio.run(main())
