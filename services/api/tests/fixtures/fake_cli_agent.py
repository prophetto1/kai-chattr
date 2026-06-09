from __future__ import annotations

import sys


def main() -> int:
    print("KAI_FAKE_CLI_READY", flush=True)
    for line in sys.stdin:
        text = line.rstrip("\r\n")
        if text == "exit":
            print("KAI_FAKE_CLI_EXIT", flush=True)
            return 0
        print(f"KAI_FAKE_CLI_ECHO {text}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
