import { NextResponse } from "next/server";
import { checkAlert, store } from "@/lib/store";
import type { SensorData } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(store.sensorData);
}

export async function POST(request: Request) {
  const apiKey = process.env.INGEST_API_KEY;
  if (apiKey && request.headers.get("x-api-key") !== apiKey) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Expected a JSON object" }, { status: 400 });
  }

  store.sensorData = {
    ...(body as SensorData),
    updated_at: new Date().toISOString(),
  };

  console.log("Received:", store.sensorData);

  await checkAlert(store.sensorData);

  return NextResponse.json({ message: "Data received" });
}
