# Coastline Sargassum and Water Quality Tracker

A live water-quality dashboard. An ESP32 sends sensor readings (pH, dissolved oxygen, hydrogen sulfide and ammonia) to this server. The dashboard shows them in real time, and the server sends a Telegram alert when conditions change.

It is built with [Next.js](https://nextjs.org/) (App Router) and TypeScript, is hosted on [Vercel](https://vercel.com/), and replaces an earlier Flask version.

> **Known issue on Vercel:** readings are currently kept in server memory, which Vercel doesn't keep reliably. Until a shared store such as Redis is added, the dashboard may show Offline or old data, and Telegram alerts may repeat. See [Limitations and notes](#limitations-and-notes).

---

## How to run it

The live site runs on Vercel (see [Deploying to Vercel](#deploying-to-vercel)). The steps below run the app on your own computer for development and testing.

### 1. Requirements

- [Node.js](https://nodejs.org/) **20.9 or newer** (check with `node -v`)
- npm, which comes with Node.js

### 2. Install

```bash
npm install
```

### 3. Configure

Copy the example environment file:

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in your values:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-your-bot-token
TELEGRAM_CHAT_ID=8221465217
INGEST_API_KEY=
SENSOR_TIMEOUT_MS=30000
```

Every setting is optional. Without a bot token the dashboard still works, but no Telegram alerts are sent. See [Configuration](#configuration) for what each setting does.

Never commit `.env.local`. It is already listed in `.gitignore`.

### 4. Start the server

**Development** (reloads automatically when you edit code):

```bash
npm run dev
```

**Production**:

```bash
npm run build
npm start
```

Both commands serve the app on **port 5000** on all network interfaces (`0.0.0.0`), the same as the old Flask app:

- Dashboard: <http://localhost:5000>
- From other devices on the network, such as the ESP32: `http://<this-computer's-IP>:5000`

To find this computer's IP address, run `ipconfig` on Windows or `ip addr` / `ifconfig` on macOS and Linux.

> Don't run `npm run build` while `npm run dev` is running. Both write to the `.next` folder and break each other. If the dev server starts throwing errors like `Cannot find module './611.js'`, stop it, delete the `.next` folder and start it again.

### 5. Point the ESP32 at the server

The ESP32 sends a JSON `POST` request to `/api/data`:

```
POST https://<your-project>.vercel.app/api/data     (live site on Vercel)
POST http://<computer-ip>:5000/api/data             (local server, for testing)
Content-Type: application/json
```

The Vercel address uses **HTTPS**, so the ESP32 code needs a secure client (`WiFiClientSecure` with `HTTPClient`). Plain `http://` requests to Vercel are redirected, and the ESP32 won't follow the redirect for a POST.

```json
{
    "ph": 7.12,
    "do": 6.8,
    "h2s": 0.4,
    "nh3": 0.7,
    "ph_status": "Normal",
    "do_status": "Normal",
    "h2s_status": "Normal",
    "nh3_status": "Normal",
    "overall_status": "Normal",
    "do_calibrated": true,
    "h2s_calibrated": true,
    "nh3_calibrated": true
}
```

If `INGEST_API_KEY` is set, the ESP32 must also send the header `x-api-key: <your key>`.

### 6. Test without the ESP32

Send a fake reading from a terminal.

macOS, Linux or Git Bash:

```bash
curl -X POST http://localhost:5000/api/data \
  -H "Content-Type: application/json" \
  -d '{"ph":6.4,"do":5.1,"h2s":1.9,"nh3":0.7,"ph_status":"Warning","do_status":"Normal","h2s_status":"Danger","nh3_status":"Normal","overall_status":"Danger"}'
```

PowerShell:

```powershell
Invoke-RestMethod http://localhost:5000/api/data -Method Post -ContentType "application/json" -Body '{"ph":6.4,"do":5.1,"h2s":1.9,"nh3":0.7,"ph_status":"Warning","do_status":"Normal","h2s_status":"Danger","nh3_status":"Normal","overall_status":"Danger"}'
```

The dashboard updates within a second. If no further readings arrive, it switches to **Offline** after 30 seconds.

If a Telegram bot token is configured, this test sends a real **Danger** alert to the chat.

To test the live site instead, replace `http://localhost:5000` with `https://<your-project>.vercel.app`. Fake readings sent there appear on the public dashboard, and they can send real alerts.

---

## Deploying to Vercel

### First deploy

1. Push the project to GitHub, GitLab or Bitbucket.
2. In the [Vercel dashboard](https://vercel.com/new), choose **Add New → Project** and import the repository. Vercel detects Next.js automatically, so the default build settings are correct.
3. Before deploying, open **Environment Variables** and add the settings from [Configuration](#configuration): at least `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, and `INGEST_API_KEY` if the ESP32 sends one.
4. Click **Deploy**. The site goes live at `https://<your-project>.vercel.app`.

### Updating the site

Every push to the main branch deploys to production automatically. Pushes to other branches get their own preview URL.

### Changing settings

Edit them under **Project → Settings → Environment Variables**, then redeploy (**Deployments → ⋯ → Redeploy**). Changes only take effect after a new deployment.

### Notes

- Port 5000 only applies when you run the app on your own computer. On Vercel the site is served over HTTPS on the normal web port.
- Server logs (received readings, Telegram results and errors) are under **Project → Logs**.
- Keep `.env.local` out of Git. To copy the Vercel settings to your computer, use `vercel env pull .env.local` from the [Vercel CLI](https://vercel.com/docs/cli).

---

## What's in it

### Project structure

```
water-quality-dashboard/
├── app/
│   ├── api/data/route.ts   API endpoint the ESP32 posts to and the dashboard reads from
│   ├── layout.tsx          Page shell: <html>, page title, viewport
│   ├── page.tsx            Home page; renders the dashboard
│   └── globals.css         All styling: colours, layout, light and dark mode
├── components/
│   └── Dashboard.tsx       The dashboard UI (runs in the browser)
├── lib/
│   ├── store.ts            Holds the latest reading, offline detection, alert logic
│   ├── telegram.ts         Sends Telegram messages
│   └── types.ts            Shape of a sensor reading
├── .env.example            Template for configuration
├── next.config.mjs         Next.js configuration
├── package.json            Dependencies and npm scripts
└── tsconfig.json           TypeScript configuration
```

### How it works

```
ESP32 ──POST /api/data──▶ route.ts ──▶ store.ts ──▶ telegram.ts ──▶ Telegram
                             ▲
Browser (Dashboard.tsx) ─GET /api/data every 1s─┘
```

1. **The ESP32 posts a reading** to `/api/data`. The server checks the API key (if one is set), rejects invalid JSON, adds an `updated_at` timestamp and stores the reading.
2. **The server decides whether to alert.** It compares the reading's `overall_status` with the last status it saw, and sends a Telegram message only when the status changes. It does not send repeats while the status stays the same.
3. **The dashboard asks for the latest reading** once a second and redraws the page.

The ESP32 decides whether each reading is Normal, Warning or Danger. The server doesn't apply any thresholds of its own; it shows and acts on the statuses it receives.

### The dashboard

- **Overall status card**: shows Normal, Warning, Danger or Offline in a matching colour, lists which sensors need checking, and shows the time of the last reading.
- **Connection indicator**:
    - **Live**: readings are arriving.
    - **Sensors offline**: no reading in the last 30 seconds, or none since the server started.
    - **Connection lost**: the browser can't reach the server.
- **Four sensor cards** (pH, DO, H₂S, NH₃): each has the current value and unit, a status pill and a small trend line of the last 40 readings. While the sensors are offline, the cards show the last known values faded.
- **Raw ADC tag**: when the ESP32 sends `do_calibrated`, `h2s_calibrated` or `nh3_calibrated` as `false`, that value is a raw sensor number rather than a real measurement. The card shows a "raw ADC" tag instead of the unit.
- **About, How it works and Precautions** sections below the cards.
- The page follows the device's light or dark mode and works on phones.

### Telegram alerts

| Status change                  | Message                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Anything → **Warning**         | 🚨 WATER QUALITY WARNING, with all four readings                                     |
| Anything → **Danger**          | 🚨🚨 WATER QUALITY DANGER, with all four readings and "Immediate attention required" |
| Warning or Danger → **Normal** | ✅ WATER QUALITY NORMAL, "returned to normal conditions"                             |

Readings from uncalibrated sensors are labelled "(raw ADC)" in the message. If sending fails, the error is logged and the ESP32's request still succeeds.

To set up a bot, message [@BotFather](https://t.me/BotFather) on Telegram, create a bot and copy its token into `TELEGRAM_BOT_TOKEN`. Then send your bot a message from the account or group that should receive the alerts.

### API reference

#### `POST /api/data`

Stores a new reading. The ESP32 uses this.

| Response                                    | Meaning                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `200 {"message": "Data received"}`          | Reading stored                                                         |
| `400 {"message": "Invalid JSON"}`           | The body isn't valid JSON                                              |
| `400 {"message": "Expected a JSON object"}` | The body is JSON but not an object                                     |
| `401 {"message": "Unauthorized"}`           | `INGEST_API_KEY` is set and the `x-api-key` header is missing or wrong |

#### `GET /api/data`

Returns the latest reading, plus two fields the server adds:

- `updated_at`: when the reading was received (ISO timestamp)
- `online`: `true` if a reading arrived within `SENSOR_TIMEOUT_MS`

Before any reading has arrived, it returns only `{"online": false}`.

### Reading fields

| Field                                                | Type                                  | Meaning                                                                        |
| ---------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `ph`                                                 | number                                | pH                                                                             |
| `do`                                                 | number                                | Dissolved oxygen in mg/L (or a raw ADC value)                                  |
| `h2s`                                                | number                                | Hydrogen sulfide in ppm (or a raw ADC value)                                   |
| `nh3`                                                | number                                | Ammonia in ppm (or a raw ADC value)                                            |
| `ph_status`, `do_status`, `h2s_status`, `nh3_status` | `"Normal"` / `"Warning"` / `"Danger"` | Status of each sensor                                                          |
| `overall_status`                                     | `"Normal"` / `"Warning"` / `"Danger"` | Overall status; this triggers the alerts                                       |
| `do_calibrated`, `h2s_calibrated`, `nh3_calibrated`  | boolean, optional                     | `false` means the value is a raw ADC reading. Leaving it out means calibrated. |

### Configuration

Set these in `.env.local` on your own computer, and under **Project → Settings → Environment Variables** on Vercel.

| Variable             | Default      | What it does                                                                                                                    |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | _(none)_     | Telegram bot token. Without it, alerts are skipped.                                                                             |
| `TELEGRAM_CHAT_ID`   | `8221465217` | Chat that receives the alerts                                                                                                   |
| `INGEST_API_KEY`     | _(none)_     | If set, `POST /api/data` requires a matching `x-api-key` header. Without it, anyone who can reach the server can post readings. |
| `SENSOR_TIMEOUT_MS`  | `30000`      | Milliseconds without a reading before the sensors show as offline. Set it to more than twice the ESP32's sending interval.      |

After changing any of these, restart the local server or redeploy on Vercel.

### npm scripts

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Starts the development server on port 5000 |
| `npm run build`     | Builds the app for production              |
| `npm start`         | Runs the production build on port 5000     |
| `npm run typecheck` | Checks the TypeScript code for errors      |

---

## Limitations and notes

- **Readings are kept in memory, which isn't reliable on Vercel.** The server holds only the latest reading, in its own memory. Vercel runs the API as serverless functions: it can start several separate copies, and it shuts copies down when they're idle. As a result:
  - The ESP32's reading may be stored in one copy while the dashboard reads from another, so the dashboard can show **Offline** or old data even though readings are arriving.
  - Readings are lost whenever a copy shuts down.
  - Each copy remembers the last alert status separately, so Telegram alerts can repeat or be missed.

  **Fix:** store the latest reading and the last alert status in a shared store, such as Upstash Redis (available from the Vercel Marketplace) or a Postgres database. That would also make it possible to keep a history of readings.

  Running locally (`npm run dev` / `npm start`) uses a single server, so this problem doesn't happen there.
- **There is no reading history.** Only the latest reading is kept, and the trend lines on the cards cover only what the open browser tab has seen.
- **TypeScript is pinned to version 5.** TypeScript 7 breaks the Next.js 15 build, so don't upgrade it without testing.
