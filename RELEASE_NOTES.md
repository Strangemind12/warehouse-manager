# Warehouse Manager v1.0.0

First public release of the Warehouse Manager Android app — a mobile inventory system for a central warehouse that supplies branch stores.

## Downloads

| File | Use it for |
| --- | --- |
| `app-release.aab` | Uploading to Google Play Console |
| `app-release.apk` | Direct install / sideloading (signed if keystore secrets are configured) |
| `app-debug.apk` | Quick testing on a device, no signing needed |

## What's included

- **Receiving** — record stock receipts with brand selection, product type images, pack size, unit price and quantity. New reagents/machines can be created inline.
- **Inventory** — single live view of everything available in the warehouse and in every branch store, with product images and quantities.
- **Transfers** — send stock from the warehouse to branches. Stock only moves once a transfer is confirmed as sent, and only quantities actually on hand can be transferred.
- **Approvals** — admins approve pending transfers and receipts; Store Officer admins can send immediately.
- **History** — every transaction carries an invoice number, date/time stamp and the person who performed it, and is searchable.
- **Activity Log** — full audit trail of inserts, updates and deletes across products, inventory, branches, transfers, receipts and roles.
- **Brands, Categories & Product Types** — admin-managed catalogue with image upload per product type.
- **Users & Roles** — invite Supervisors and Store Officers by email with a temporary password they must reset at first login.
- **Multi-company** — self sign-ups become admins of their own company, with company name applied across the app.
- Naira (₦) currency throughout, mobile-first layouts, and no white flash between pages.

## Requirements

- Android 6.0 (API 23) or newer
- Internet connection (data is synced to the hosted backend in real time)

## Install (APK)

1. Download `app-debug.apk` or `app-release.apk` below.
2. On your phone allow installs from unknown sources for your browser/file manager.
3. Open the file and tap Install.

## Known notes

- The release APK/AAB is unsigned unless `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` repository secrets are set. Google Play requires the signed AAB.
