# Wrap & Roll Website and POS System Guide

This guide explains how the Wrap & Roll customer website, staff point of sale (POS), kitchen display, and management tools work together. It describes the current application behavior and the operational setup required to run it.

## 1. System at a Glance

Wrap & Roll is a React web application backed by a Node.js/Express API. The public website and authenticated staff dashboard use the same API and database. Orders created online, from a table QR/NFC link, or at the counter are stored in the same order system and can be followed through payment, kitchen preparation, and completion.

```text
Customer website / Staff POS / Kitchen display
                    |
             HTTP API + WebSocket
                    |
       Express server + SQLite database
                    |
 Payments, orders, menu, customers, stock,
 notifications, reporting, printers, email
```

The frontend is in `src/`. The API, database, and background services are in `server/`. In production, Express can serve the built frontend and API from the same domain. Vite runs the frontend during development.

## 2. What Customers Can Do

### Public website

The public home page is served at `/`. It presents the restaurant information, location and contact details, menu, and online ordering interface. `/privacy-policy` displays the privacy page. `/customer-rewards` and `/rewards` open the customer loyalty and order-history view.

The website loads active menu items, modifiers, categories, and public settings from the API. The server is authoritative for menu prices and order totals; it rechecks item availability and calculates the final amount when an order is submitted. The cart and selected customer details are persisted in browser storage so a refresh does not normally discard an unfinished cart.

### Online ordering

1. The customer browses the menu and adds items, quantities, variants, modifiers, and special instructions.
2. The customer chooses the order/fulfilment details and supplies the required contact information. Delivery requires an address. Dine-in requires an available table.
3. Optional scheduling must be in the future and no more than 14 days ahead.
4. Company invoice checkout requires company name and TIN. Invoice terms are accepted only if the company has an approved account and enough remaining credit.
5. The server creates the order, payment record, customer association, and order event. A payment reference is generated for payment tracking.
6. For standard mobile-money checkout, the customer follows the displayed Lipa Namba/TIPS instructions and submits the transaction details. The order remains unconfirmed until payment is verified, either by staff or by a configured payment webhook.
7. The website checks payment/order status and displays the latest known state. Customers can track an order using the order reference and matching phone number.

Orders can originate from the website or from a tagged table at `/table/:tagId`. Table-tag orders inherit the table context and are recorded with an NFC/table source. A roadside handoff order can provide a customer tracking link at `/roadside-track/:orderId`; its access token is checked by the roadside API.

### Loyalty and customer recognition

Orders are matched to existing customers using contact information and company identity where available. Customer pages and rewards features expose visit history, loyalty information, eligible rewards, and reorder actions. Paid-order processing updates customer value and loyalty state. Email marketing enrollment is not the same as marketing consent: new email addresses enter pending verification/consent workflows and unsubscribed or suppressed contacts are not silently re-added.

## 3. Staff Sign-In and Access

Staff sign in at `/login`. Staff routes are protected by authentication and role/page access. The current roles are:

| Role | Typical responsibilities |
| --- | --- |
| Admin | Full POS and management access, settings, staff administration |
| FOH | Counter POS, tables, orders, customers, roadside operations, payment verification |
| Kitchen | Kitchen display, staff playbook, assistant |
| Manager | Orders, customers, payments, CRM, menu, analytics, and operations |
| Executive | CRM, analytics, reporting, campaigns, and operations |

An administrator can further restrict page access for an individual staff account. The interface hides pages the user cannot access, and protected routes redirect users who lack access. Server endpoints also apply authentication and role checks where required; hiding a page in the frontend is not the security boundary.

## 4. Using the Counter POS

The staff till is at `/pos`.

### Build a cart

- Search or browse active menu items and categories.
- Choose product variants, add/remove modifiers, and record item instructions.
- Change quantities, remove items, enter order notes, and apply the available cart discount.
- Add a custom item when permitted for staff orders.
- Hold a bill to clear the active cart and resume it later on that browser/device. Held bills are stored in local browser storage, not in the shared order database until checkout.

### Choose order type and checkout

Checkout asks for the relevant order type and details, such as a dine-in table, delivery address, or roadside handoff. The payment page can associate a saved customer and capture contact/company details. The server recalculates all line prices and tax from current menu/settings data; client-submitted subtotal and total values are not authoritative.

Common payment outcomes:

- **Cash at the till:** a staff cash order is recorded as paid immediately and can proceed to fulfilment.
- **Lipa Namba/mobile money:** the POS creates the order and opens the payment instructions/QR workflow. A staff member verifies a submitted payment claim from Payment Verification, unless a configured provider webhook confirms it automatically.
- **Company invoice:** available only for an approved company account with an adequate credit limit. The order is recorded under invoice terms and appears in Orders for follow-up.
- **Offline queue:** if the staff POS cannot reach the API, the order submission can be queued in the browser's IndexedDB. It synchronizes when connectivity returns. A queued order is not yet a server order, is not visible to the kitchen, and should be checked for synchronization before staff assume it was received. Public website ordering requires a live API connection.

The POS can open `/pos/tables` for table layout/status management. Completing a dine-in order moves its table into cleaning; the table becomes available again after the configured cleaning interval is released by the server.

## 5. Payment Lifecycle

The standard payment flow is Lipa Namba/TIPS with manual review:

1. The server creates an order with a unique payment reference and a pending payment row.
2. The payment intent returns the configured merchant account, amount, currency, reference, QR payload, and network instructions.
3. The customer submits the mobile-money transaction code and sender details. This changes the payment to `manual_review`; it does **not** confirm the order.
4. Authorized staff inspect the claim in Management > Payment Verification and verify or reject it. Verification records who handled it and the time, marks the order paid/confirmed, and broadcasts the update to connected screens.
5. A configured provider can instead call the payment webhook. The server checks the matched reference, transaction idempotency, provider status, and amount before marking a payment paid. Underpayments are held for review rather than released as paid.

Important payment/order states include `pending`, `manual_review`, `paid`, `failed`, and `refunded` for payment, and `pending_payment`, `confirmed`, `preparing`, `ready`, `completed`, and `cancelled` for order fulfillment. A payment failure or unverified claim must not be treated as payment confirmation.

The live checkout account list comes from the `lipa_namba_accounts` setting or `LIPA_ACCOUNTS_JSON`. Production must use the real merchant accounts. If none are configured, the payment intent cannot be created and checkout should not be used to accept mobile-money payments.

The server contains an optional generic webhook adapter for mobile-money providers and gateways. The ordinary checkout path does not redirect through Pesapal; older payment documentation and leftover Pesapal environment placeholders should not be read as proof that a Pesapal merchant integration is configured or live. Set `PAYMENT_WEBHOOK_SECRET` when using a provider webhook that supports signed requests.

## 6. Kitchen and Order Fulfillment

The Kitchen Display System (KDS) is at `/kds`. It loads active orders and listens for WebSocket events so new orders, payment claims, confirmations, and status changes appear without requiring a full page reload.

The typical fulfillment sequence is:

```text
pending payment -> confirmed -> preparing -> ready -> completed
```

- Orders awaiting payment are visible separately for operational awareness, but cannot normally be started.
- The KDS can start preparation only after verified payment. The server enforces this rule. Dine-in postpay and eligible confirmed/released company-invoice orders are the explicit exceptions.
- Scheduled orders stay out of active preparation until their computed release time.
- Roadside handoff orders require roadside operations to release them to the kitchen, unless already in a later kitchen state.
- Kitchen staff mark orders preparing, ready, and completed. Completing a dine-in order begins table cleaning.

When fulfillment effects are first applied, configured menu ingredients deduct inventory and write inventory audit entries. Paid customer orders update customer lifetime value and loyalty processing. The application records order events and broadcasts changes for the other connected screens.

## 7. Staff and Management Areas

The authenticated dashboard is organized around role-specific navigation:

| Area | What it is for |
| --- | --- |
| Orders | Search/filter orders, inspect customer and payment details, and follow fulfillment |
| Customers | Customer records and customer-level activity |
| Roadside & Reservations | Manage scheduled/roadside handoffs, runner assignment, kitchen release, and handoff |
| Payment Verification | Review customer payment claims and verify or reject them |
| CRM & Loyalty | Customer relationships, loyalty activity, and communication workflows |
| WhatsApp | WhatsApp customer conversations/integration when provider credentials are configured |
| Analytics / Reports | Operational and sales summaries, exports, and reporting |
| Menu Editor | Manage menu items, categories, modifiers, variants, images, and availability |
| Operations | Operational tasks and business administration tools |
| People & HR | Staff and people-management workflows; admin-only route |
| Loyalty Items | Manage redeemable loyalty items and related settings |
| Campaigns / Email Marketing | Customer campaigns, contacts, email automations, consent, and delivery status |
| Team Kanban / Staff Playbook | Team coordination and operating procedures |
| Notifications | Role/user-scoped operational alerts |
| Settings | Restaurant details, tax, payment accounts, printer, and system configuration; admin-only route |

Integrations such as WhatsApp, Instagram messaging, email delivery, Google Maps, and automated payment webhooks require their respective provider credentials. Without credentials, an integration may be unavailable; the interface should not be interpreted as a successful external send.

## 8. Printers, Displays, and Offline Use

The web POS can run in a browser. The Windows desktop package uses Electron and bundles the frontend/server for a branch installation. The Android companion can load the hosted POS and use a paired Bluetooth thermal printer through its native integration.

The optional printer agent handles printing from the server/branch printer connection. A hosted server cannot directly reach a printer physically attached to a branch computer; a branch desktop print agent must remain running and paired for hosted orders to print locally. Printer configuration and pairing are managed in Settings. The desktop installer and Android companion have separate build/release prerequisites; see `DEPLOYMENT.md` for the detailed procedures.

Offline behavior is deliberately limited: the staff order store can queue an order submission locally and retry it when online. This is not a general offline copy of the cloud database. Menu changes, shared order visibility, payment verification, kitchen synchronization, and public checkout require API connectivity. Confirm the queued-order count has returned to zero after reconnecting.

## 9. Technical Components and Data

- **Frontend:** React 18, Vite, React Router, Zustand stores, and API client in `src/`.
- **API:** Express routes in `server/routes/`; the browser calls `/api` by default.
- **Realtime:** WebSocket service at `/ws`, used for order, payment, menu, inventory, table, and notification updates.
- **Database:** SQLite through `better-sqlite3`, with foreign keys and write-ahead logging enabled. `DB_PATH` selects the database file. The schema includes users, menu/catalog, customers, orders/order items/events, payments, tables, inventory, settings, and notifications, plus supporting business tables.
- **Background services:** Email marketing worker starts with the server. Printer agent startup is controlled by `PRINTER_AGENT_ENABLED=true`.
- **Client build:** `npm run build` writes the production frontend to `dist/`. In production, Express serves those static files and falls back to `index.html` for frontend routes.

The API route families are mounted in `server/index.js`: authentication, menu, orders, roadside, tables, customers, staff, inventory, settings, notifications, analytics, chat, payments, calendar, loyalty, business, CRM intelligence, printer, desktop, and email marketing. The API client in `src/api/client.js` is the frontend's main request boundary.

## 10. Run and Deploy

### Local development

Requirements: Node.js 22 and npm. From `wrap-roll-pos/`:

```powershell
npm install
npm run dev
```

The root development script starts the API and Vite client together. The Vite proxy targets `http://localhost:3000`, which matches the `PORT=3000` default in `.env.example`. If you change the API port, update the Vite proxy target as well.

Build and run the production-style server:

```powershell
npm run build
npm start
```

Useful scripts include `npm run seed` for the database seed script and `npm run desktop:build` for the Windows installer. Review the seed script before running it against a database containing live data.

### Production essentials

Use `DEPLOYMENT.md` as the operational deployment checklist. At minimum:

- Set a long, unique `JWT_SECRET` and the correct `CORS_ORIGIN`.
- Set `PUBLIC_APP_URL` to the public site origin for generated table links.
- Configure real `LIPA_ACCOUNTS_JSON` accounts and verify checkout before accepting orders.
- Set `DB_PATH` to persistent storage. SQLite data on an ephemeral container filesystem will be lost when the instance is replaced.
- Configure email, Meta messaging, Google Maps, payment webhooks, Wi-Fi QR, and printer variables only when those integrations are in use.
- Back up the live database before migrations, redeployments, or seed operations.
- Check `/api/health` after deployment. It should return an OK response with the database ready.

For detailed Railway, Windows POS, printer pairing, data-volume, and Android printer companion steps, see `DEPLOYMENT.md`.

## 11. Common Operational Checks

| Symptom | Check |
| --- | --- |
| Website loads but menu is empty | Check `/api/health`, menu API availability, active menu items, and browser/API origin configuration |
| Local app cannot reach the API | Compare API `PORT` with the Vite `/api` proxy target (`3000`) and check server startup output |
| Mobile-money checkout cannot open | Confirm real payment accounts exist in Settings or `LIPA_ACCOUNTS_JSON` |
| Order appears as manual review | Staff must match the payment reference/transaction and verify it in Payment Verification |
| Kitchen cannot start an order | Check payment status, invoice/reservation eligibility, scheduled release time, and roadside kitchen release |
| Till shows queued offline orders | Restore API connectivity and wait for the queue to sync; verify the queue count is zero and the server order exists |
| Online order does not print at the branch | Confirm the branch print agent is running, paired, and connected to the hosted service and selected printer |
| Data disappeared after redeploy | Check that `DB_PATH` points to the attached persistent volume and restore from backup if needed |

## 12. Source Map

- Route definitions and access guards: `src/App.jsx`, `src/utils/roleAccess.js`
- Public customer experience: `src/pages/public/`
- Staff POS and checkout: `src/pages/pos/`
- Kitchen display: `src/pages/kds/KDSPage.jsx`
- API client and state stores: `src/api/`, `src/store/`
- Order creation and state changes: `server/routes/orders.js`
- Payment processing and verification: `server/routes/payments.js`, `server/utils/paymentProviders.js`
- Server startup and route mounting: `server/index.js`
- Database schema and migrations: `server/db/database.js`
- Deployment and device setup: `DEPLOYMENT.md`