# Changelog

All notable changes to the **Astro-Tech Calculator** project will be documented in this file.

## [V8] - 2025-11-22
### Added
- **Security**: Added `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` headers to Nginx.
- **Optimization**: Added `.dockerignore` to exclude development files from production builds.
- **Theme**: Added Apple-inspired light theme support.

### Fixed
- **Offline Mode**: Updated `sw.js` to cache the newly separated `style.css` and `script.js` files.

## [V7] - 2025-11-22
### Changed
- **Refactor**: Split the monolithic `index.html` into separate files:
    - `style.css`: Contains all styles and the Antigravity theme.
    - `script.js`: Contains all application logic and animations.
    - `index.html`: Contains only markup and links to external resources.

## [V6] - 2025-11-22
### Added
- **Design**: Implemented "Antigravity" design language.
- **Theme**: New "Google Clean" light theme (Soft Gray/White).
- **Animation**: Added interactive Particle Network background using HTML5 Canvas.

## [V5] - 2025-11-22
### Added
- **Architecture**: Switched to **Static Cache Architecture**.
- **Backend**: Created `worker.py` to fetch rates in the background (Python).
- **Docker**: Added `Dockerfile.worker` and updated `docker-compose.yml` to run Nginx and Worker services.
- **Data**: Nginx now serves static `rates.json` and `history.json` directly from a shared volume.

## [V3] - 2025-11-21
### Added
- **Deployment**: Dockerized the application using Nginx Alpine.
- **Config**: Added custom `nginx.conf` for Gzip compression and caching rules.

## [V2] - 2025-11-21
### Added
- **PWA**: Made the application installable (Progressive Web App).
- **Assets**: Added `manifest.json`, `sw.js`, and app icons.

## [V1] - 2025-11-21
### Initial Release
- Basic USD/VES Calculator.
- Official (BCV) and Parallel rate fetching.
- Historical charts using Chart.js.
- Dark/Light mode toggle.
