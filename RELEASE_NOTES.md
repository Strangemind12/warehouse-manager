# Warehouse Manager v1.0.2

Fixes the persistent black "Forbidden" screen in the installed Android app.

## What changed

- The Android WebView now identifies as a normal mobile browser instead of an embedded development WebView.
- Cookies and local web storage are explicitly enabled for authentication.
- Old cached error pages are cleared on first launch.
- The Android package is versioned as **1.0.2 (102)** so it cannot be confused with the previous broken artifact.

## Downloads

| File | Use it for |
| --- | --- |
| `app-debug.apk` | Install straight on any Android phone — no signing needed (v1.0.2) |
| `app-release.apk` | Direct install / sideloading (signed if keystore secrets are configured) |
| `app-release.aab` | Uploading to Google Play Console |

## Install (APK)

1. Download `app-debug.apk` below on your phone.
2. Allow installs from unknown sources for your browser / file manager.
3. Open the file and tap **Install**, then sign in with your account.

## What's included

- **Receiving** — record stock receipts with brand selection, product type images, pack size, unit price and quantity. New reagents/machines can be created inline.
- **Inventory** — one live view of everything available in the warehouse and in every branch store, with images and quantities.
- **Transfers** — send stock from the warehouse to branches. Stock only moves once a transfer is confirmed as sent, and only quantities actually on hand can be transferred.
- **Approvals** — admins approve pending transfers and receipts; Store Officer admins can send immediately.
- **History** — every transaction carries an invoice number, date/time stamp and the person who performed it, and is searchable.
- **Activity Log** — full audit trail across products, inventory, branches, transfers, receipts and roles.
- **Brands, Categories & Product Types** — admin-managed catalogue with image upload per product type.
- **Users & Roles** — invite Supervisors and Store Officers by email with a temporary password they must reset at first login.
- **Multi-company** — self sign-ups become admins of their own company, with the company name applied across the app.
- Naira (₦) currency throughout and mobile-first layouts.

## Requirements

- Android 6.0 (API 23) or newer
- Internet connection (data syncs to the hosted backend in real time)
