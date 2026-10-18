import { sendTelegram } from "./telegram";
import type { SensorData } from "./types";

type Store = {
  sensorData: SensorData;
  lastAlertStatus: string;
};

const initialData: SensorData = {
  ph: 7.12,
  do: 6.8,
  h2s: 0.4,
  nh3: 0.7,
  ph_status: "Normal",
  do_status: "Normal",
  h2s_status: "Normal",
  nh3_status: "Normal",
  overall_status: "Normal",
};

// In-memory state, kept on globalThis so it survives hot reloads in dev.
// Like the Flask version, it resets when the server restarts.
const g = globalThis as typeof globalThis & { __waterQualityStore?: Store };

export const store: Store = (g.__waterQualityStore ??= {
  sensorData: initialData,
  lastAlertStatus: "Normal",
});

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
