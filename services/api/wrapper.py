"""Compatibility entrypoint for the packaged CLI wrapper."""

from app.wrappers.cli import *  # noqa: F401,F403
from app.wrappers.cli import main


if __name__ == "__main__":
    main()

