#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--yunet", required=True)
    parser.add_argument("--auraface", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    canonical = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "run-controlled-pilot-synthetic-face-pipeline-v1.py",
    )
    if not os.path.isfile(canonical):
        print(
            '{"error":"canonical_executor_missing","message":"controlled-pilot synthetic executor is unavailable"}',
            file=sys.stderr,
        )
        return 2

    completed = subprocess.run(
        [
            sys.executable,
            canonical,
            "--fixture",
            args.image,
            "--yunet-model",
            args.yunet,
            "--auraface-model",
            args.auraface,
            "--output",
            args.output,
        ],
        check=False,
    )
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
