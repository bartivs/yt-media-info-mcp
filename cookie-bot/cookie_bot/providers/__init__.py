"""
Cookie provider discovery module.

In v1, providers are statically imported.  To add a new provider:
  1. Create a new module in this package that subclasses CookieProvider
  2. Import it here
  3. Add it to CONFIGURED_PROVIDERS

Auto-discovery (entry_points, filesystem scan) may be added in a future version.
"""

from cookie_bot.providers.base import CookieProvider
from cookie_bot.providers.google import GoogleProvider
from cookie_bot.providers.vimeo import VimeoProvider
from cookie_bot.providers.twitch import TwitchProvider

# All known provider classes.  get_configured_providers() filters to those
# whose env vars are present.
ALL_PROVIDERS: list[type[CookieProvider]] = [
    GoogleProvider,
    VimeoProvider,
    TwitchProvider,
]


def get_configured_providers() -> list[CookieProvider]:
    """Return a list of instantiated providers that are configured via env vars."""
    configured: list[CookieProvider] = []
    for cls in ALL_PROVIDERS:
        provider = cls()
        if provider.is_configured():
            configured.append(provider)
    return configured
