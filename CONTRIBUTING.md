# Contributing to Imladris on Web

We welcome contributions to **Imladris on Web**, the browser-based collaborative sister project of native [Imladris](https://github.com/Antux912012/imladris).

## Local Development

```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test
```

For the Python/R execution runner:

```bash
python3 -m venv services/runner/.venv
services/runner/.venv/bin/pip install -r services/runner/requirements.txt pytest httpx
PYTHONPATH=services/runner services/runner/.venv/bin/pytest services/runner/tests/test_runner.py -v
```

## License

All contributions are licensed under the Apache License 2.0 (`Apache-2.0`). Include SPDX headers on new source files:

```ts
// SPDX-FileCopyrightText: 2026 Your Name
// SPDX-License-Identifier: Apache-2.0
```
