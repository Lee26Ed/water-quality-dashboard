import { sendTelegram } from "./telegram";
import type { SensorData } from "./types";

type Store = {
  // null until the ESP32 sends its first reading.
  sensorData: SensorData | null;
  lastAlertStatus: string;
};

// Sensors count as offline if no reading arrived within this window.
const SENSOR_TIMEOUT_MS = Number(process.env.SENSOR_TIMEOUT_MS) || 30_000;

// In-memory state, kept on globalThis so it survives hot reloads in dev.
// Like the Flask version, it resets when the server restarts.
const g = globalThis as typeof globalThis & { __waterQualityStore?: Store };

export const store: Store = (g.__waterQualityStore ??= {
  sensorData: null,
  lastAlertStatus: "Normal",
});

export function isOnline(data: SensorData | null): boolean {
  if (!data?.updated_at) return false;
  return Date.now() - new Date(data.updated_at).getTime() < SENSOR_TIMEOUT_MS;
}

function buildReadingsLine(data: SensorData): string {
  const ph = data.ph ?? "--";
  const doVal = data.do ?? "--";
  const h2s = data.h2s ?? "--";
  const nh3 = data.nh3 ?? "--";

  // Missing flag means calibrated; false means the value is a raw ADC reading.
  const doCalibrated = data.do_calibrated ?? true;
  const h2sCalibrated = data.h2s_calibrated ?? true;
  const nh3Calibrated = data.nh3_calibrated ?? true;

  let line = `pH: ${ph}`;
  line += doCalibrated ? `\nDO: ${doVal} mg/L` : `\nDO: ${doVal} (raw ADC)`;
  line += h2sCalibrated ? `\nH₂S: ${h2s} ppm` : `\nH₂S: ${h2s} (raw ADC)`;
  line += nh3Calibrated ? `\nNH₃: ${nh3} ppm` : `\nNH₃: ${nh3} (raw ADC)`;
  return line;
}

export async function checkAlert(data: SensorData): Promise<void> {
  const status = data.overall_status ?? "Normal";

  if (status === store.lastAlertStatus) {
    return;
  }

  const readingsLine = buildReadingsLine(data);

  if (status === "Warning") {
    await sendTelegram(
      "🚨 WATER QUALITY WARNING\n\n" +
        "Location: Hopkins Village\n\n" +
        `${readingsLine}\n\n` +
        "Check the dashboard."
    );
  } else if (status === "Danger") {
    await sendTelegram(
      "🚨🚨 WATER QUALITY DANGER\n\n" +
        "Location: Hopkins Village\n\n" +
        `${readingsLine}\n\n` +
        "Immediate attention required.\n" +
        "Check the dashboard."
    );
  } else if (
    status === "Normal" &&
    ["Warning", "Danger"].includes(store.lastAlertStatus)
  ) {
    await sendTelegram(
      "✅ WATER QUALITY NORMAL\n\n" +
        "Location: Hopkins Village\n\n" +
        "Water quality has returned to normal conditions."
    );
  }

  store.lastAlertStatus = status;
}
