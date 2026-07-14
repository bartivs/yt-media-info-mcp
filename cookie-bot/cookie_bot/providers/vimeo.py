"""
Vimeo cookie provider.

Vimeo uses a straightforward email+password login flow without 2FA.
"""

import logging
import os

from playwright.async_api import BrowserContext, Page

from cookie_bot.providers.base import CookieProvider

logger = logging.getLogger("cookie-bot.providers.vimeo")

NAVIGATION_TIMEOUT = 30_000
ELEMENT_TIMEOUT = 15_000


class VimeoProvider(CookieProvider):
    @property
    def name(self) -> str:
        return "Vimeo"

    @property
    def required_env_vars(self) -> list[str]:
        return ["VIMEO_EMAIL", "VIMEO_PASSWORD"]

    @property
    def cookie_domains(self) -> list[str]:
        return [".vimeo.com"]

    async def login(self, page: Page, context: BrowserContext) -> bool:
        """Execute the Vimeo login flow.

        Steps:
          1. Navigate to Vimeo login page
          2. Fill email and password
          3. Submit the form
          4. Wait for redirect to homepage

        Returns True if login succeeded, False otherwise.
        """
        logger.info("Starting Vimeo login flow …")

        try:
            await page.goto(
                "https://vimeo.com/log_in",
                timeout=NAVIGATION_TIMEOUT,
                wait_until="domcontentloaded",
            )

            # Fill email
            email_input = page.locator('input[type="email"], input[name="email"]')
            await email_input.wait_for(timeout=ELEMENT_TIMEOUT)
            await email_input.fill(os.environ["VIMEO_EMAIL"])

            # Fill password
            password_input = page.locator('input[type="password"], input[name="password"]')
            await password_input.wait_for(timeout=ELEMENT_TIMEOUT)
            await password_input.fill(os.environ["VIMEO_PASSWORD"])

            # Submit login form
            submit = page.locator(
                'button[type="submit"], input[type="submit"], button:has-text("Log in")'
            )
            await submit.click()

            # Wait for redirect to homepage
            try:
                await page.wait_for_url(
                    "https://vimeo.com/",
                    timeout=NAVIGATION_TIMEOUT,
                )
            except Exception:
                # Check for CAPTCHA
                if await self._detect_captcha(page):
                    logger.warning("Vimeo login blocked by CAPTCHA — run --setup to complete interactively")
                    return False
                logger.warning("Did not redirect to Vimeo homepage after login — URL: %s", page.url)
                return False

            logger.info("Vimeo login successful")
            return True

        except Exception as exc:
            if await self._detect_captcha(page):
                logger.warning("Vimeo login blocked by CAPTCHA — run --setup to complete interactively")
            else:
                logger.warning("Vimeo login failed: %s", exc)
            return False

    async def _detect_captcha(self, page: Page) -> bool:
        """Detect if a CAPTCHA challenge is present on the page."""
        captcha_indicators = [
            page.locator('iframe[src*="recaptcha"]'),
            page.locator('div[class*="captcha"]'),
            page.get_by_text("verify you're human"),
            page.get_by_text("unusual traffic"),
        ]
        for indicator in captcha_indicators:
            try:
                if await indicator.is_visible(timeout=2000):
                    return True
            except Exception:
                continue
        return False
