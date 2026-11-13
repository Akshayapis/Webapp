# U APP — Build Anything. Launch Everywhere.

Premium app-creation platform: React 19 + Vite + Tailwind on the front end, a Render-hosted
Node server, Firebase Authentication / Realtime Database, and a **Kaggle-powered Android build engine**
that compiles real APK/AAB files.

## What is implemented

- Premium landing site, dark/light themes, animated product demos, 54 UI templates.
- Firebase Authentication (Google + Email/Password), password reset, real email verification.
- Free plan: 3 app creation credits per calendar month, server-checked; paid plans; fail-safe credits;
  rebuilds never consume a credit.
- Manual UPI payments with a real UPI-intent QR, UTR submission, PENDING → approved history.
- Full builder: 12 project types, website URL-only flow, HTML paste, real ZIP analysis with
  supported / partial / unsupported classification, permissions + `permission.txt`, 54 templates.
- Ad networks: managed platform App IDs (users never type an App ID), supported formats per network,
  HTML ad load tags (banner div + button-triggered interstitial/rewarded), load-request console.
- Developer portal: REST endpoint contracts, Python/PHP/JS samples, SHA-256 hashed API keys.
- Support centre, activity log, settings, downloads with a live build terminal.
- **Kaggle Android build engine** — real notebook execution, queue, actual logs, real artifacts.

## Kaggle build engine

`server/kaggle.mjs` is an API client for the official Kaggle API (Basic auth with
`KAGGLE_USERNAME` / `KAGGLE_KEY`). It creates a private Kaggle **dataset** from the preserved source
(`/datasets/create` or `/datasets/version/:ref`), pushes the worker notebook (`/kernels/push`),
polls `/kernels/status/:ref`, and downloads `/kernels/output/:ref`.

`kaggle/worker/worker.ipynb` is the actual worker:

1. Reads `job.json` from the attached dataset.
2. Verifies internet access (required for Android SDK downloads).
3. Installs JDK 17, Android command-line tools, platform 34, build-tools and Gradle 8.9.
4. Uses the uploaded project if it contains a Gradle project, otherwise generates a real Android
   WebView project for the website URL / HTML source.
5. Runs `assembleDebug` and `bundleRelease`.
6. Uploads the APK/AAB and real `build.log` back to Render using a per-job upload token; outputs also
   remain in the Kaggle notebook output.

`server/index.mjs` provides the queue and API:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Kaggle credentials verified, queue length, active job, timeouts |
| `POST /api/source` | Preserve the original ZIP (Render disk + Kaggle dataset) |
| `POST /api/build` | Firebase ID-token verification, quota check, create a unique build job |
| `GET /api/build/:jobId/status` | Real Kaggle status, real logs, artifacts, 9-minute expiry |
| `GET /api/build/:jobId/artifact/:name` | Owner-only streamed APK/AAB while the link is valid |
| `POST /api/build/:jobId/cancel` | Queue cancellation; running Kaggle kernels cannot be cancelled via the public API |
| POST-ish `/api/build/:jobId/upload` | Worker → Render artifact upload (HMAC job token) |

Queue rules: one active Kaggle worker, duplicate-request prevention per app, persisted queue on disk,
execution timeout (`KAGGLE_TIMEOUT_MINUTES`, default 30), real error reporting, and truthful
limitations. No fake status, logs or APKs are produced. When the engine is unavailable, the app is
still delivered as a genuinely working installable package (PWA shell, icons, offline cache) and the
UI states exactly why the APK is missing.

### Kaggle prerequisites (real platform limitations)

- Kaggle notebooks must have **Internet enabled** to download Android SDK/Gradle. Kaggle requires
  phone verification for internet access.
- Kaggle is not an always-on server. Jobs are queued, pushed through the API, and polled.
- Running notebooks cannot be cancelled by the public API; queued jobs can be cancelled.
- Android builds take several minutes. The browser stays usable meanwhile.

## Render deployment (no file editing)

1. Deploy this repository as a Docker service (Blueprint uses `render.yaml`).
2. Set environment variables:
   - `KAGGLE_USERNAME` — your Kaggle username.
   - `KAGGLE_KEY` — your current Kaggle API key (Kaggle → Settings → API → Create New Token).
   - `APP_URL` — the Render service URL.
   - Optional: `KAGGLE_TIMEOUT_MINUTES`, `DOWNLOAD_TTL_SECONDS`, `BUILD_UPLOAD_SECRET`.
3. `render.yaml` mounts a 1 GB disk at `/var/uapp-data` so preserved sources and the queue survive
   restarts. Artifacts are still deleted nine minutes after a successful build.
4. Firebase Authentication requires the Render hostname in Firebase Console → Authentication →
   Settings → Authorized domains. Enable Google and Email/Password providers.

Credentials are read only by the server. They are never bundled into the frontend, returned by the
API, or written to logs.

## Local commands

```bash
npm install
npm run dev          # Vite front end
node server/index.mjs # build server (serves dist/ too)
npm run build        # production bundle
```

## Directory notes

- `server/index.mjs` — queue, auth, quota, artifacts and static hosting.
- `server/kaggle.mjs` — Kaggle API client.
- `kaggle/worker/worker.ipynb` — real build worker notebook.
- `firebase.rules.json` — Realtime Database rules.
- `Dockerfile` / `render.yaml` — deployment.
