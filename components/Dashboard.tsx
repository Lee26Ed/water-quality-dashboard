"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SensorData, SensorKey } from "@/lib/types";

const POLL_MS = 1000;
const HISTORY_LEN = 40;

const SENSORS: {
  key: SensorKey;
  label: ReactNode;
  name: string;
  unit: string;
}[] = [
  { key: "ph", label: "pH", name: "Acidity / alkalinity", unit: "" },
  { key: "do", label: "DO", name: "Dissolved oxygen", unit: "mg/L" },
  { key: "h2s", label: <>H<sub>2</sub>S</>, name: "Hydrogen sulfide", unit: "ppm" },
  { key: "nh3", label: <>NH<sub>3</sub></>, name: "Ammonia", unit: "ppm" },
];

const STATUS_COPY: Record<string, string> = {
  normal: "All readings are within normal ranges.",
  warning: "One or more readings are outside the normal range.",
  danger: "Readings indicate hazardous conditions. Immediate attention required.",
};

type History = Record<SensorKey, number[]>;

function statusClass(status: string | undefined): string {
  const value = status?.toLowerCase();
  return value === "normal" || value === "warning" || value === "danger" ? value : "unknown";
}

function isRaw(data: SensorData, key: SensorKey): boolean {
  return key !== "ph" && data[`${key}_calibrated`] === false;
}

function formatValue(data: SensorData, key: SensorKey): string {
  const raw = data[key];
  if (raw === undefined || raw === null || raw === "") return "--";
  if (isRaw(data, key)) return String(raw);
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : "--";
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="spark spark-empty">Collecting trend…</div>;
  }

  const w = 200;
  const h = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`)
    .join(" ");

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "normal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 7v6M12 17h.01" />
    </svg>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<SensorData | null>(null);
  const [online, setOnline] = useState(true);
  const [history, setHistory] = useState<History>({ ph: [], do: [], h2s: [], nh3: [] });
  const lastStamp = useRef<string | null | undefined>(null);

  useEffect(() => {
    let cancelled = false;

    async function updateData() {
      try {
        const response = await fetch("/api/data", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next: SensorData = await response.json();
        if (cancelled) return;

        setData(next);
        setOnline(true);

        // Only record a trend point when the ESP32 has posted a new reading.
        if (next.updated_at !== lastStamp.current) {
          lastStamp.current = next.updated_at;
          setHistory((prev) => {
            const out = { ...prev };
            for (const { key } of SENSORS) {
              const n = Number(next[key]);
              if (Number.isFinite(n)) out[key] = [...prev[key], n].slice(-HISTORY_LEN);
            }
            return out;
          });
        }
      } catch (error) {
        console.error("Failed to retrieve sensor data:", error);
        if (!cancelled) setOnline(false);
      }
    }

    updateData();
    const id = setInterval(updateData, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const overall = statusClass(data?.overall_status);
  const flagged = data
    ? SENSORS.filter(({ key }) => {
        const s = statusClass(data[`${key}_status`]);
        return s === "warning" || s === "danger";
      })
    : [];

  const lastReading = data?.updated_at
    ? new Date(data.updated_at).toLocaleTimeString()
    : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#home" className="brand">
            <span className="brand-mark">CST</span>
            <span className="brand-text">
              <strong>Coastline Sargassum</strong>
              <span>and Water Quality Tracker</span>
            </span>
          </a>
          <nav className="nav">
            <a href="#tracker">Tracker</a>
            <a href="#about">About</a>
            <a href="#how-it-works">How it works</a>
            <a href="#precautions">Precautions</a>
          </nav>
        </div>
      </header>

      <section className="hero" id="home">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">Live coastal monitoring</span>
            <h1>Coastline Sargassum and Water Quality Tracker</h1>
            <p>
              Real-time pH, dissolved oxygen, hydrogen sulfide and ammonia readings from
              sensors along the Hopkins coastline.
            </p>
          </div>

          <div className={`overall-card ${overall}`} id="overall-status" aria-live="polite">
            <div className="overall-head">
              <span className="location-chip">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
                Hopkins Village
              </span>
              <span className={`live ${online ? "on" : "off"}`}>
                <span className="live-dot" />
                {online ? "Live" : "Offline"}
              </span>
            </div>

            <div className="overall-body">
              <span className="overall-icon">
                <StatusIcon status={overall} />
              </span>
              <div>
                <div className="overall-label">Overall status</div>
                <div className="overall-value">{data?.overall_status ?? "Loading…"}</div>
              </div>
            </div>

            <p className="overall-copy">
              {data ? STATUS_COPY[overall] ?? "Status unavailable." : "Connecting to sensors…"}
              {flagged.length > 0 && (
                <>
                  {" "}Check:{" "}
                  {flagged.map(({ key, label }, i) => (
                    <span key={key}>
                      {i > 0 && ", "}
                      <strong>{label}</strong>
                    </span>
                  ))}
                  .
                </>
              )}
            </p>

            <div className="overall-foot">
              {lastReading ? `Last reading at ${lastReading}` : data ? "Showing default values, no sensor reading yet" : " "}
            </div>
          </div>
        </div>

        <svg className="hero-wave" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden>
          <path d="M0 40c120 24 240 36 360 30S600 30 720 22s240-6 360 10 240 40 360 34V80H0z" />
        </svg>
      </section>

      <main>
        <section className="section" id="tracker">
          <div className="section-head">
            <div>
              <span className="eyebrow">Tracker data</span>
              <h2>Sensor readings</h2>
            </div>
            <a href="#precautions" className="btn">
              Precautions →
            </a>
          </div>

          <div className="sensor-grid">
            {SENSORS.map(({ key, label, name, unit }) => {
              const status = data?.[`${key}_status`];
              const cls = statusClass(status);
              const raw = data ? isRaw(data, key) : false;

              return (
                <article key={key} className={`sensor-card ${cls}`}>
                  <div className="sensor-top">
                    <div>
                      <h3>{label}</h3>
                      <div className="sensor-name">{name}</div>
                    </div>
                    <span className={`pill ${cls}`}>{status ?? "--"}</span>
                  </div>

                  <div className="sensor-value">
                    <span id={key} className="value">
                      {data ? formatValue(data, key) : "--"}
                    </span>
                    {raw ? (
                      <span className="badge">raw ADC</span>
                    ) : (
                      unit && <span className="unit">{unit}</span>
                    )}
                  </div>

                  <div className="sensor-trend">
                    <Sparkline values={history[key]} />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="legend">
            <span><i className="dot normal" /> Normal</span>
            <span><i className="dot warning" /> Warning</span>
            <span><i className="dot danger" /> Danger</span>
          </div>
        </section>

        <section className="section info-grid">
          <div className="info-card" id="about">
            <span className="eyebrow">About us</span>
            <h2>Watching the coastline</h2>
            <p>
              The Coastline Sargassum and Water Quality Tracker monitors water conditions in
              coastal areas and provides information about changes in water quality.
            </p>
          </div>

          <div className="info-card" id="how-it-works">
            <span className="eyebrow">How it works</span>
            <h2>From sensor to screen</h2>
            <ol className="steps">
              <li>
                <span>1</span>
                <div><strong>Sensors</strong> measure pH, DO, H₂S and NH₃ in the water.</div>
              </li>
              <li>
                <span>2</span>
                <div><strong>ESP32</strong> processes the measurements and sends them to the monitoring system.</div>
              </li>
              <li>
                <span>3</span>
                <div><strong>Dashboard &amp; alerts</strong> update live, and Telegram alerts go out when status changes.</div>
              </li>
            </ol>
          </div>

          <div className="info-card" id="precautions">
            <span className="eyebrow">Precautions</span>
            <h2>Reading the data</h2>
            <p>
              Sensor readings should be interpreted together with the overall monitoring
              conditions and not from a single measurement alone.
            </p>
            <p className="muted">
              Values marked <span className="badge">raw ADC</span> come from sensors that are
              not yet calibrated and are not in real units.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        Coastline Sargassum and Water Quality Tracker · Hopkins Village
      </footer>
    </>
  );
}
