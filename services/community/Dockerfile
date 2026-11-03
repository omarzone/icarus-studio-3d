# Community service image for a server. Build from this folder: `docker build -t icarus-community .`
FROM python:3.12-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.11.31 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra postgres --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --extra postgres

RUN useradd --system --uid 10001 icarus && mkdir -p /data && chown icarus /data
USER icarus

ENV ENV=production FILES_DIR=/data/files DATABASE_URL=sqlite:////data/community.db
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8790/health', timeout=4)"
CMD ["/app/.venv/bin/icarus-community", "serve", "--host", "0.0.0.0", "--port", "8790"]
