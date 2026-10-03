# Railway Deployment

Railway runs the app as one Node service. Express serves the frontend and the `/api` and `/ws` endpoints from the same domain, while FOH and KDS use separate browser windows against the same service and database.

## Required environment

Copy `.env.example` to `.env` and set:

- `JWT_SECRET`: a long random value. This is required when `NODE_ENV=production`.
- `CORS_ORIGIN`: comma-separated frontend origins. Set this to `https://wrapandrolltz.com` when the frontend uses the Railway custom domain.
- `PUBLIC_APP_URL`: public origin used to generate NFC table scan links. Set this to `https://wrapandrolltz.com`.
- `PORT`: the port supplied by the hosting provider, when applicable.
- `DB_PATH`: the path to `wraproll.db` on persistent storage. For Docker deployments use `/data/wraproll.db` and mount `/data` to a named volume or host directory.
- `RESEND_API_KEY` and a Resend-verified `EMAIL_FROM_ADDRESS`: configure Resend API delivery for marketing email.
- `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, and `EMAIL_FROM_ADDRESS`: configure SMTP delivery as a fallback.
- `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`: configure the WhatsApp Business Cloud API sender.
- `INSTAGRAM_ACCESS_TOKEN` (or shared `META_ACCESS_TOKEN`) and `INSTAGRAM_PAGE_ID`: configure Instagram Messaging for the connected professional account.
- `META_GRAPH_API_VERSION`: optional Graph API version; defaults to `v23.0`.
- `EMAIL_REPLY_TO`, `EMAIL_POSTAL_ADDRESS`, and `EMAIL_DKIM_SELECTOR`: set reply handling, the real postal address required in marketing footers, and the DKIM DNS selector.
- `EMAIL_WEBHOOK_SECRET`: bearer secret for `POST /api/email-marketing/webhooks/events` integration events. `subscriber.created` events must include `marketingConsent: true`; `order.paid` events enroll already-consented customers in post-visit automations.

CRM messages are sent through these provider APIs; missing credentials produce a configuration error rather than a false success. WhatsApp free-form messages are subject to Meta's customer-service window and may require an approved template outside it. Instagram recipients must have messaged the connected account and their Meta-scoped recipient ID must be saved in the customer's loyalty profile; a public Instagram profile URL is not a messaging recipient ID.

## Email Marketing service

The POS includes a self-hosted contact, campaign, template, automation, suppression, and delivery-tracking service at Management > Email Marketing. Campaigns are queued and processed by the server worker. Only active contacts with `consent_status=subscribed` and no suppression are eligible. Subscriber CSV imports must include a `consent` or `marketing_consent` column with an affirmative value; opt-outs are signed, one-click capable, and permanently suppressed until explicit re-consent is recorded.

The app uses an authenticated SMTP relay for outbound mail. It does not run an MTA inside the Railway web container: reliable self-hosted sending additionally requires a static IP, port 25 access, matching PTR/rDNS, domain DNS control, and bounce/complaint handling. Use the Sending setup page to test SMTP and check SPF, DKIM, DMARC, MX, and optional PTR records. Do not send production campaigns until DNS authentication and the real postal address are configured.

For a separately hosted frontend, set `VITE_API_BASE_URL` to the API URL ending in `/api` and `VITE_WS_URL` to the API WebSocket URL ending in `/ws` before building.

Location search and map selection use Google Maps JavaScript, Places, and Geocoding APIs. Set `VITE_GOOGLE_MAPS_API_KEY` before building the frontend and restrict the browser key in Google Cloud to the local and production web origins. The key is intentionally not stored in the repository.

## Build and run

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

The service listens on `PORT` and serves the frontend from `dist`. Client-side routes fall back to `index.html`, while `/api/health` can be used as the deployment health check.

## Railway setup

The repository is connected to Railway service `wrap-roll` on the `main` branch. Railway deploys automatically after every push.

1. Add a Railway Volume to service `wrap-roll` mounted at `/data`.
2. Set `DB_PATH=/data/wraproll.db`.
3. Set `JWT_SECRET` to a long random value.
4. Set `CORS_ORIGIN=https://wrapandrolltz.com`.
5. Deploy and confirm `/api/health` returns `{ "ok": true }`.

The `railway.toml` file configures the Docker build, health check, and restart policy. Do not remove the `/data` volume: SQLite data is not retained by Railway deployments without it.

Google Business Profile cannot be fetched automatically from only a public Maps URL. Automatic synchronization requires a Google Cloud project, OAuth consent screen, Business Profile APIs, and authorized manager credentials. Until those credentials are supplied, administrators can keep the public Maps URL, branch details, contact information, and weekly hours accurate from System Settings.

Set `LIPA_ACCOUNTS_JSON` in Railway to the real Megamore payment accounts before accepting orders. It must be a JSON array with `network`, `number`, `name`, and optional `ussd` fields. The old hardcoded account is intentionally removed; without configured accounts checkout blocks payment submission.

## Desktop POS release

Build the signed Windows installer with `npm run desktop:build`, publish the resulting NSIS `.exe` to a trusted release host, then set `DESKTOP_POS_DOWNLOAD_URL`, `DESKTOP_POS_VERSION`, `DESKTOP_POS_SHA256`, and `DESKTOP_POS_SIZE` in Railway. Admin Settings will show the verified release metadata and download link. Windows still requires the operator to run the downloaded installer and approve UAC.

Each new desktop installation opens a local branch setup screen before FOH/KDS. Enter a unique branch code and branch name; the values are stored in that branch's local offline SQLite database.

## Windows POS installation

1. Copy the project to a simple path such as `C:\WrapRollPOS`.
2. Run PowerShell and execute `Set-ExecutionPolicy -Scope Process Bypass`.
3. Run `npm install` once, then `npm run build`.
4. Start the local service by running `start-pos.ps1` from the installation folder.
5. In a second PowerShell window, run `launch-displays.ps1`. The default assumes the KDS monitor begins at x=1920; pass `-KdsX` for another monitor layout.

The FOH window opens at `/pos` and the kitchen window opens at `/kds`. Sign in once in each window with the appropriate staff account. Separate browser profiles keep FOH and KDS sessions independent, while both windows receive order updates through the local WebSocket connection.

For local automatic startup, create shortcuts to `start-pos.ps1` and `launch-displays.ps1` in the POS Windows startup folder. Keep the service window running during operations. The launchers keep the local database at `%LOCALAPPDATA%\WrapRollPOS\wraproll.db`.

## Database persistence
## Thermal receipt printing

The hosted POS cannot access a printer attached to a branch computer. Install the updated Windows desktop POS on the till connected to the printer; its local print agent pairs outbound to the hosted POS and prints staff POS orders from the branch's Bluetooth/COM printer. Keep the desktop POS running while phone or browser orders need to print.

1. Pair the Romeson KP58ZJ in Windows Bluetooth settings and confirm Windows created an outgoing COM port.
2. In hosted System Settings > Receipt Printer, generate a one-time pairing code.
3. In the Windows desktop POS, open local System Settings > Receipt Printer, scan ports, select the outgoing printer COM port if it was not uniquely detected, and enter the pairing code.
4. Save settings and use Test Print from the Windows till.

The KP58ZJ profile defaults to 58 mm paper, 32 columns, and 9600 baud. The 5V/2A rating is a power requirement, not a software setting. Bluetooth device names do not always identify printer models, so Windows COM auto-selection is automatic only when a single printer candidate is unambiguous; otherwise select the outgoing port manually. ESC/POS does not reliably report installed roll width, so width is configured from the selected printer profile rather than physically sensed. Staff orders created on the local desktop database print locally while offline; cloud-created staff POS orders queue in Railway and print after the till reconnects. Jobs older than 24 hours are marked failed rather than printed unexpectedly.

## Database persistence

## Android Bluetooth printer companion

The Android companion loads the hosted POS at `https://wrapandrolltz.com` and uses a native Bluetooth Classic SPP plugin to print locally from the phone. Build it on a workstation with Android Studio, Android SDK Platform 36, and JDK 17 installed:

```bash
npm install
npm run mobile:android:sync
npm run mobile:android:open
```

In Android Studio, build or install the `android` app. On the phone, pair the thermal printer in Android Bluetooth settings, then open System Settings > Receipt Printer, refresh paired devices, and select the printer. Android 12+ asks for the Bluetooth connect permission on first use. The app lists already paired printers; it does not scan or connect to arbitrary nearby devices.

Receipt and invoice actions in the Android app send ESC/POS data over SPP. Browser and Windows desktop printing continue to use their existing paths. To build an APK from the command line after setting up the SDK:

```bash
npm run mobile:android:build
```

The `server.url` in `capacitor.config.json` makes this companion load the hosted POS. The Android package needs rebuilding when changing that URL or the native Bluetooth plugin.

The app stores orders, payments, customers, staff activity, notifications, and settings in SQLite. A new container or hosting instance has a new filesystem, so deploying the image alone cannot preserve live data.

For Docker, create and reuse a named volume:

```bash
docker volume create wrap-roll-data
docker run -d --name wrap-roll-pos -p 3000:3000 -v wrap-roll-data:/data wrap-roll-pos
```

If your hosting provider offers persistent disks, attach one to `/data` and set `DB_PATH=/data/wraproll.db`. Do not deploy this service on an ephemeral filesystem without either a persistent disk or an external database. Back up the configured SQLite database before redeploying.

## Railway volume and migration

Before the first Railway deployment with the volume attached, copy the existing local database to the Railway volume as `wraproll.db`. Use the Railway volume file tools or a one-time migration job. Never deploy with an empty ephemeral `/data` path if the live local database contains orders.
