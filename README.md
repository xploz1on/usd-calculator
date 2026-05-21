# Astro-Tech Calculator

A lightweight currency converter web app for Venezuelan exchange rates, served by Nginx with a background Python worker that refreshes rate and history data.

## Project Overview

- Static frontend in `public/`
- Python worker fetches and stores exchange data
- Nginx serves the app and exposes JSON endpoints
- Docker Compose runs the web and worker services together

## Repository Layout

- `public/`
  - `index.html`, `style.css`, `script.js` — static frontend files
  - `worker.py` — background fetcher for rate and history data
  - `nginx.conf` — web server configuration
  - `Dockerfile` — web service image definition
  - `Dockerfile.worker` — worker image definition
  - `entrypoint.sh` — worker startup entrypoint
- Root `docker-compose.yml` — orchestrates `web` and `worker`

## Requirements

- Docker
- Docker Compose (v2+)

## Run locally with Docker

From the repository root:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:8081
```

Stop the stack with:

```bash
docker compose down
```

## Services

### `worker`

- Built from `public/Dockerfile.worker`
- Runs `worker.py` to fetch:
  - official and parallel VES rates
  - USDT Binance rate
  - EUR/USD exchange rate
- Writes generated data into the shared `/data` volume
- Produces:
  - `rates.json`
  - `history.json`
  - `rates.js`
  - `history.js`

### `web`

- Built from `public/Dockerfile`
- Serves static files and JSON endpoints via Nginx
- Exposes:
  - `/api/rates` → `rates.json`
  - `/api/history` → `history.json`
- Proxies `/api/binance` to Binance P2P to avoid CORS issues

## Docker Notes

- `public/Dockerfile` uses a pinned `nginx:1.25.0-alpine` base image
- `public/Dockerfile.worker` uses `python:3.11.7-slim`
- The root `docker-compose.yml` creates a shared named volume `data_volume`
- Both services include health checks and proper startup ordering

## Security and Best Practices

- Nginx configuration includes security headers:
  - `server_tokens off`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-XSS-Protection: 1; mode=block`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
- Python dependencies are pinned in `public/requirements.txt`
- Keep credentials and secrets out of source control
- The worker and web services are separated to limit blast radius

## Tips

- Use `docker compose up --build -d` for detached mode
- Use `docker compose ps` to inspect service status
- Use `docker compose logs -f` to follow runtime logs

## Recommended Improvements

- Add GitHub branch protection and PR gating
- Enable additional dependency and secret scanning
- Add runtime monitoring or alerting for worker failures
- Add a `favicon.ico` to the static app assets
