# Warehouse Manager

Multi-branch inventory management system for reagents and lab machines. Built with TanStack Start, Supabase, and Capacitor (Android-ready).

## Features

- **Receiving** — Record stock receipts with product images, brand selection, and pack sizes
- **Inventory** — Live stock levels across warehouse and all branches with real-time updates
- **Transfers** — Move stock between locations with approval workflow
- **Approvals** — Admins approve/decline pending transfers and receipts inline
- **History** — Searchable timeline of all transactions with invoice numbers and timestamps
- **Activity Log** — Full audit trail of every action with person, date/time, and what changed
- **Users & Roles** — Admin, Supervisor, Store Officer, and Procurement roles with invite system
- **Brands & Categories** — Manage brands, categories, product types with images
- **Company Setup** — Multi-tenant: each new signup creates their own company workspace

## Tech Stack

- **Frontend**: TanStack Start (React 19), Tailwind CSS v4, shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Mobile**: Capacitor (loads published web app in Android WebView)

## Getting Started

```bash
npm install
npm run dev
```

## Android Build

See [ANDROID.md](ANDROID.md) for local build instructions.

The GitHub Actions workflow (`.github/workflows/android-build.yml`) builds:
- **Debug APK** on every push to `main`
- **Signed release AAB/APK** on releases or manual trigger (requires signing secrets)

### Signing secrets (for release builds)

Add these repository secrets under Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` keystore file (`base64 -i keystore.jks`) |
| `ANDROID_STORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias name |
| `ANDROID_KEY_PASSWORD` | Key password |

Generate a keystore locally:
```bash
keytool -genkey -v -keystore keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias warehouse
base64 -i keystore.jks > keystore_b64.txt
```

## License

Proprietary — All rights reserved.
