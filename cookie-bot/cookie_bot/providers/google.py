"""
Google/YouTube cookie provider.

Handles the multi-page Google sign-in flow including TOTP-based 2FA.
"""

import logging
import os

import pyotp
from playwright.async_api import BrowserContext, Page

from cookie_bot.providers.base import CookieProvider

logger = logging.getLogger("cookie-bot.providers.google")

# Timeouts
NAVIGATION_TIMEOUT = 30_000  # 30 seconds
ELEMENT_TIMEOUT = 15_000     # 15 seconds


class GoogleProvider(CookieProvider):
    @property
    def name(self) -> str:
        return "Google"

    @property
    def required_env_vars(self) -> list[str]:
        return ["GOOGLE_EMAIL", "GOOGLE_PASSWORD"]

    @property
    def cookie_domains(self) -> list[str]:
        return [".youtube.com", ".google.com"]

    async def login(self, page: Page, context: BrowserContext) -> bool:
        """Execute the Google/YouTube login flow.

        Steps:
          1. Navigate to YouTube (triggers sign-in redirect)
          2. Fill email, click Next
          3. Fill password, click Next
          4. Handle TOTP if GOOGLE_TOTP_SECRET is set and 2FA is prompted
          5. Verify login success by checking the page after redirect

        Returns True if login succeeded, False otherwise.
        """
        logger.info("Starting Google login flow …")

        try:
            # Navigate to YouTube — this will redirect to accounts.google.com
            # if not already signed in.
            await page.goto(
                "https://www.youtube.com/",
                timeout=NAVIGATION_TIMEOUT,
                wait_until="domcontentloaded",
            )

            # Check if already signed in
            if await self._is_signed_in(page):
                logger.info("Already signed in to YouTube")
                return True

            # Click the "Sign in" button on YouTube
            sign_in_button = page.get_by_role("button", name="Sign in")
            if await sign_in_button.is_visible(timeout=5000):
                await sign_in_button.click()
                await page.wait_for_url("**/accounts.google.com/**", timeout=NAVIGATION_TIMEOUT)

            # ---- Step 1: Email ----
            email_input = page.locator('input[type="email"]')
            await email_input.wait_for(timeout=ELEMENT_TIMEOUT)
            await email_input.fill(os.environ["GOOGLE_EMAIL"])
            await page.get_by_role("button", name="Next").click()

            # ---- Step 2: Password ----
            password_input = page.locator('input[type="password"]')
            await password_input.wait_for(timeout=ELEMENT_TIMEOUT)
            await password_input.fill(os.environ["GOOGLE_PASSWORD"])
            await page.get_by_role("button", name="Next").click()

            # ---- Step 3: Handle TOTP 2FA if prompted ----
            totp_secret = os.environ.get("GOOGLE_TOTP_SECRET")
            if totp_secret:
                try:
                    code_input = page.locator('input[type="tel"]')
                    if await code_input.is_visible(timeout=5000):
                        totp_code = pyotp.TOTP(totp_secret).now()
                        logger.info("Entering TOTP code …")
                        await code_input.fill(totp_code)
                        await page.get_by_role("button", name="Next").click()
                        await page.wait_for_timeout(2000)
                except Exception:
                    # No 2FA prompt — proceed
                    pass

            # ---- Step 4: Wait for redirect back to YouTube ----
            try:
                await page.wait_for_url(
                    "**/youtube.com/**",
                    timeout=NAVIGATION_TIMEOUT,
                )
            except Exception:
                # Check for CAPTCHA
                if await self._detect_captcha(page):
                    logger.warning("Google login blocked by CAPTCHA — run --setup to complete interactively")
                    return False
                # Maybe still on a Google page — check for error
                logger.warning("Did not redirect to YouTube after login — page URL: %s", page.url)
                return False

            # ---- Step 5: Verify ----
            if await self._is_signed_in(page):
                logger.info("Google login successful")
                return True

            logger.warning("Google login completed but sign-in status not detected")
            return False

        except Exception as exc:
            if await self._detect_captcha(page):
                logger.warning("Google login blocked by CAPTCHA — run --setup to complete interactively")
            else:
                logger.warning("Google login failed: %s", exc)
            return False

    async def _is_signed_in(self, page: Page) -> bool:
        """Check if the current YouTube page shows a signed-in state."""
        try:
            # If we see the avatar button, we're signed in
            avatar = page.locator('#avatar-btn, button[aria-label*="avatar"]')
            return await avatar.is_visible(timeout=3000)
        except Exception:
            return False

    async def _detect_captcha(self, page: Page) -> bool:
        """Detect if a CAPTCHA challenge is present on the page."""
        captcha_indicators = [
            page.locator('#captcha-form'),
            page.locator('iframe[src*="recaptcha"]'),
            page.locator('div[class*="captcha"]'),
            page.get_by_text("unusual traffic"),
            page.get_by_text("verify you're human"),
        ]
        for indicator in captcha_indicators:
            try:
                if await indicator.is_visible(timeout=2000):
                    return True
            except Exception:
                continue
        return False
