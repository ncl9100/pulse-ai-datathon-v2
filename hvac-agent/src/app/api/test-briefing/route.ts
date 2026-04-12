/**
 * GET /api/test-briefing
 * Step-by-step diagnostic for the briefing pipeline
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

export async function GET() {
  const steps: Record<string, unknown> = {};

  try {
    // Step 1: Load scan data
    const scanPath = path.join(process.cwd(), "src", "data", "scan.json");
    steps.step1_scanPath = scanPath;
    steps.step1_scanExists = fs.existsSync(scanPath);

    const scanRaw = fs.readFileSync(scanPath, "utf-8");
    const allProjects = JSON.parse(scanRaw);
    steps.step1_projectCount = allProjects.length;
    steps.step1 = "OK";
  } catch (e: unknown) {
    steps.step1 = `FAILED: ${(e as Error).message}`;
    return NextResponse.json(steps);
  }

  try {
    // Step 2: Check project detail files
    const projectsDir = path.join(process.cwd(), "src", "data", "projects");
    steps.step2_projectsDir = projectsDir;
    steps.step2_dirExists = fs.existsSync(projectsDir);

    if (fs.existsSync(projectsDir)) {
      const files = fs.readdirSync(projectsDir);
      steps.step2_fileCount = files.length;
      steps.step2_files = files.slice(0, 5);
    }
    steps.step2 = "OK";
  } catch (e: unknown) {
    steps.step2 = `FAILED: ${(e as Error).message}`;
    return NextResponse.json(steps);
  }

  try {
    // Step 3: Load one project file
    const projectsDir = path.join(process.cwd(), "src", "data", "projects");
    const files = fs.readdirSync(projectsDir);
    if (files.length > 0) {
      const firstFile = path.join(projectsDir, files[0]);
      const data = JSON.parse(fs.readFileSync(firstFile, "utf-8"));
      steps.step3_firstProject = files[0];
      steps.step3_keys = Object.keys(data);
    }
    steps.step3 = "OK";
  } catch (e: unknown) {
    steps.step3 = `FAILED: ${(e as Error).message}`;
    return NextResponse.json(steps);
  }

  try {
    // Step 4: Test a single Claude call with project data
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      steps.step4 = "FAILED: No API key";
      return NextResponse.json(steps);
    }

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: 'Return this exact JSON: {"root_causes":[{"category":"Labor","explanation":"Test","dollars_over_budget":50000}],"recovery_actions":[{"action":"Test action","estimated_recovery":25000}]}',
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    steps.step4_response = textBlock?.text?.substring(0, 200);
    steps.step4_tokens = message.usage;
    steps.step4 = "OK";
  } catch (e: unknown) {
    steps.step4 = `FAILED: ${(e as Error).message}`;
    return NextResponse.json(steps);
  }

  steps.all_steps = "PASSED";
  return NextResponse.json(steps);
}
