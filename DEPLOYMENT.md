# Deployment

The app runs as one Node service on the POS computer. Express serves the built frontend and the `/api` and `/ws` endpoints, while FOH and KDS use separate browser windows against the same local service and database.

## Required environment

Copy `.env.example` to `.env` and set:

- `JWT_SECRET`: a long random value. This is required when `NODE_ENV=production`.
- `CORS_ORIGIN`: comma-separated frontend origins. The local POS launcher sets this automatically.
- `PORT`: the port supplied by the hosting provider, when applicable.
- `DB_PATH`: the path to `wraproll.db` on persistent storage. For Docker deployments use `/data/wraproll.db` and mount `/data` to a named volume or host directory.

For a separately hosted frontend, set `VITE_API_BASE_URL` to the API URL ending in `/api` and `VITE_WS_URL` to the API WebSocket URL ending in `/ws` before building.

## Build and run

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

The service listens on `PORT` and serves the frontend from `dist`. Client-side routes fall back to `index.html`, while `/api/health` can be used as the deployment health check.

## Windows POS installation

1. Copy the project to a simple path such as `C:\WrapRollPOS`.
2. Run PowerShell and execute `Set-ExecutionPolicy -Scope Process Bypass`.
3. Run `npm install` once, then `npm run build`.
4. Start the local service by running `start-pos.ps1` from the installation folder.
5. In a second PowerShell window, run `launch-displays.ps1`. The default assumes the KDS monitor begins at x=1920; pass `-KdsX` for another monitor layout.

The FOH window opens at `/pos` and the kitchen window opens at `/kds`. Sign in once in each window with the appropriate staff account. Separate browser profiles keep FOH and KDS sessions independent, while both windows receive order updates through the local WebSocket connection.

For automatic startup, create shortcuts to `start-pos.ps1` and `launch-displays.ps1` in the POS Windows startup folder. Keep the service window running during operations. The launchers keep the database at `%LOCALAPPDATA%\WrapRollPOS\wraproll.db`, outside the deployed project folder, and migrate the old `server/db/wraproll.db` there on first launch. Back up this file before maintenance.

## Database persistence

The app stores orders, payments, customers, staff activity, notifications, and settings in SQLite. A new container or hosting instance has a new filesystem, so deploying the image alone cannot preserve live data.

For Docker, create and reuse a named volume:

```bash
docker volume create wrap-roll-data
docker run -d --name wrap-roll-pos -p 3000:3000 -v wrap-roll-data:/data wrap-roll-pos
```

If your hosting provider offers persistent disks, attach one to `/data` and set `DB_PATH=/data/wraproll.db`. Do not deploy this service on an ephemeral filesystem without either a persistent disk or an external database. Back up the configured SQLite database before redeploying.

## Reverse proxy

Terminate TLS at the hosting provider or reverse proxy and forward both HTTP requests and WebSocket upgrades to the Node service. Set `CORS_ORIGIN` to the exact public origin rather than `*`.
