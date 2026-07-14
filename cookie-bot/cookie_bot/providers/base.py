"""
Abstract base class for cookie providers.

Each provider implements the login flow for a specific service (e.g., Google,
Vimeo, Twitch). A provider is "configured" when all its required environment
variables are set.
"""

import os
from abc import ABC, abstractmethod
from typing import Optional

from playwright.async_api import BrowserContext, Page


class CookieProvider(ABC):
    """Abstract base for a service-specific cookie provider.

    Subclasses must override:
      - name             → human-readable provider name
      - required_env_vars → list of env var names needed for configuration
      - cookie_domains   → list of domain strings for cookie filtering
      - login()          → the Playwright-based login flow
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name (e.g. 'Google', 'Vimeo', 'Twitch')."""

    @property
    @abstractmethod
    def required_env_vars(self) -> list[str]:
        """Environment variables that must be set for this provider to be
        considered configured.

        The first two variables are conventionally ``EMAIL`` and ``PASSWORD``.
        Additional variables (e.g. ``TOTP_SECRET``) are optional.
        """

    @property
    @abstractmethod
    def cookie_domains(self) -> list[str]:
        """Domain substrings used to filter extracted cookies.

        Example: for YouTube cookies, return [\".youtube.com\", \".google.com\"].
        """

    @abstractmethod
    async def login(self, page: Page, context: BrowserContext) -> bool:
        """Execute the provider's login flow.

        Args:
            page: A fresh Playwright Page (navigated by the implementor).
            context: The BrowserContext (for cookie extraction).

        Returns:
            True if login succeeded, False otherwise.
        """

    def is_configured(self) -> bool:
        """Check whether all required environment variables are set."""
        for var in self.required_env_vars:
            if not os.environ.get(var):
                return False
        return True

    def _env(self, name: str, default: Optional[str] = None) -> Optional[str]:
        """Read an environment variable for this provider."""
        return os.environ.get(name, default)
