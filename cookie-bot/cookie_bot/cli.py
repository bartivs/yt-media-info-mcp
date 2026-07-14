"""
Command-line argument parsing for cookie-bot.

Provides three modes:
  - Normal (default): infinite refresh loop
  - --setup: launches Chromium with CDP for interactive login
  - --once: runs a single refresh cycle then exits
"""

import argparse


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Argument list (defaults to sys.argv[1:]).

    Returns:
        Parsed arguments namespace with attributes:
          - setup: bool — launch interactive CDP setup mode
          - once: bool — run a single refresh cycle then exit
    """
    parser = argparse.ArgumentParser(
        prog="cookie-bot",
        description="Automated cookie refresh sidecar using Playwright+Chromium.",
    )

    parser.add_argument(
        "--setup",
        action="store_true",
        help="Launch Chromium with CDP for interactive login setup. "
        "Provides a Chrome DevTools Protocol endpoint so you can complete "
        "CAPTCHA and 2FA in your own browser.",
    )

    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single refresh cycle then exit. Useful for testing.",
    )

    return parser.parse_args(argv)
