/**
 * GET /api/projects?id=PRJ-2021-260
 *
 * Returns detailed data for a single project — the agent uses this
 * to drill into a flagged project for root cause reasoning.
 * Uses pre-computed JSON files instead of DuckDB.
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("id");

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing required parameter: id" },
      { status: 400 }
    );
  }

  try {
    const filePath = path.join(process.cwd(), "src", "data", "projects", `${projectId}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: `Project ${projectId} not found or no pre-computed data available` },
      { status: 404 }
    );
  }
}
