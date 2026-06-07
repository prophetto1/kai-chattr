"""Compatibility entrypoint for the packaged API wrapper."""

from app.wrappers.api import *  # noqa: F401,F403
from app.wrappers.api import main


if __name__ == "__main__":
    main()

