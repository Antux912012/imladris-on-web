# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    pandoc \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 10001 runner && useradd -u 10001 -g 10001 -m runner

WORKDIR /app
COPY services/runner/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir numpy pandas matplotlib

COPY services/runner/app ./app
RUN mkdir -p /data/workspaces && chown -R 10001:10001 /data/workspaces /app

USER 10001:10001
EXPOSE 9000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
