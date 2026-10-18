export type SensorKey = "ph" | "do" | "h2s" | "nh3";

export type Status = "Normal" | "Warning" | "Danger";

// Payload posted by the ESP32. `*_calibrated === false` means the value is a raw ADC reading.
export type SensorData = { [K in SensorKey]?: number | string } & {
  [K in SensorKey as `${K}_status`]?: string;
} & {
  [K in SensorKey as `${K}_calibrated`]?: boolean;
} & {
  overall_status?: string;
  // Set by the server when a reading is received.
  updated_at?: string;
};
