"""
Twitch cookie provider.

Twitch uses a simple login form with optional TOTP-based 2FA.
"""

import logging
import os

import pyotp
from playwright.async_api import BrowserContext, Page

from cookie_bot.providers.base import CookieProvider

logger = logging.getLogger("cookie-bot.providers.twitch")

NAVIGATION_TIMEOUT = 30_000
ELEMENT_TIMEOUT = 15_000


class TwitchProvider(CookieProvider):
    @property
    def name(self) -> str:
        return "Twitch"

    @property
    def required_env_vars(self) -> list[str]:
        return ["TWITCH_EMAIL", "TWITCH_PASSWORD"]

    @property
    def cookie_domains(self) -> list[str]:
        return [".twitch.tv"]

    async def login(self, page: Page, context: BrowserContext) -> bool:
        """Execute the Twitch login flow.

        Steps:
          1. Navigate to Twitch login page
          2. Fill username/email and password
          3. Submit the form
          4. Handle TOTP if TWITCH_TOTP_SECRET is set and 2FA is prompted
          5. Wait for redirect to homepage

        Returns True if login succeeded, False otherwise.
        """
        logger.info("Starting Twitch login flow …")

        try:
            await page.goto(
                "https://www.twitch.tv/login",
                timeout=NAVIGATION_TIMEOUT,
                wait_until="domcontentloaded",
            )

            # Wait for the login form to render
            await page.wait_for_timeout(2000)

            # Fill username/email
            username_input = page.locator(
                'input[autocomplete="username"], '
                'input[id*="login-username"], '
                'input[name="username"]'
            )
            await username_input.wait_for(timeout=ELEMENT_TIMEOUT)
            await username_input.fill(os.environ["TWITCH_EMAIL"])

            # Fill password
            password_input = page.locator(
                'input[type="password"], '
                'input[name="password"]'
            )
            await password_input.wait_for(timeout=ELEMENT_TIMEOUT)
            await password_input.fill(os.environ["TWITCH_PASSWORD"])

            # Submit login form
            submit = page.locator(
                'button[type="submit"], '
                'button:has-text("Log In"), '
                'button:has-text("Continue")'
            )
            await submit.click()

            # ---- Handle TOTP if prompted ----
            totp_secret = os.environ.get("TWITCH_TOTP_SECRET")
            if totp_secret:
                try:
                    code_input = page.locator(
                        'input[autocomplete="one-time-code"], '
                        'input[name*="code"], '
                        'input[inputmode="numeric"]'
                    )
                    if await code_input.is_visible(timeout=5000):
                        totp_code = pyotp.TOTP(totp_secret).now()
                        logger.info("Entering TOTP code …")
                        await code_input.fill(totp_code)
                        # Click the submit/verify button
                        verify_btn = page.locator(
                            'button[type="submit"]:has-text("Verify"), '
                            'button:has-text("Confirm")'
                        )
                        if await verify_btn.is_visible(timeout=3000):
                            await verify_btn.click()
                        await page.wait_for_timeout(3000)
                except Exception:
                    # No 2FA prompt — proceed
                    pass

            # ---- Wait for redirect to homepage ----
            try:
                await page.wait_for_url(
                    "https://www.twitch.tv/",
                    timeout=NAVIGATION_TIMEOUT,
                )
            except Exception:
                if await self._detect_captcha(page):
                    logger.warning("Twitch login blocked by CAPTCHA — run --setup to complete interactively")
                    return False
                logger.warning("Did not redirect to Twitch homepage after login — URL: %s", page.url)
                return False

            logger.info("Twitch login successful")
            return True

        except Exception as exc:
            if await self._detect_captcha(page):
                logger.warning("Twitch login blocked by CAPTCHA — run --setup to complete interactively")
            else:
                logger.warning("Twitch login failed: %s", exc)
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
