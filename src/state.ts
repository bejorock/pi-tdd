import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { TddFlow, TddPointer } from "./types";

// ---- Pointer: .tdd/flow.json (active service + cycle) ----
export function readPointer(wt: string): TddPointer | null {
	const p = join(wt, ".tdd", "flow.json");
	if (!existsSync(p)) return null;
	try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

export function writePointer(wt: string, ptr: TddPointer): void {
	const dir = join(wt, ".tdd");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "flow.json"), JSON.stringify(ptr, null, 2));
}

// ---- Flow: .tdd/<service>/<cycleId>/flow.json ----
export function readFlow(wt: string, service: string, cycleId: string): TddFlow | null {
	const p = flowPath(wt, service, cycleId);
	if (!existsSync(p)) return null;
	try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

export function writeFlow(wt: string, flow: TddFlow): void {
	const dir = dirname(flowPath(wt, flow.service, flow.cycleId));
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "flow.json"), JSON.stringify(flow, null, 2));
}

export function advanceFlow(wt: string, service: string, cycleId: string, step: string): void {
	const flow = readFlow(wt, service, cycleId);
	if (!flow) throw new Error(`Flow not found: ${service}/${cycleId}`);
	flow.step = step;
	writeFlow(wt, flow);
}

export function activeServiceFlow(wt: string): TddFlow | null {
	const ptr = readPointer(wt);
	if (!ptr) return null;
	return readFlow(wt, ptr.activeService, ptr.activeCycleId);
}

// ---- Cycle helpers ----
export function cycleId(): string {
	return randomBytes(3).toString("hex"); // 6-char hex
}

export function cyclePlanPath(service: string, cycleId: string): string {
	return `.tdd/${service}/${cycleId}/PLAN.md`;
}

export function cycleDir(service: string, cycleId: string): string {
	return `.tdd/${service}/${cycleId}`;
}

export function cycleIdFromPath(planPath: string): string {
	const parts = planPath.replace(/^\.tdd\//, "").split("/");
	return parts[1] ?? "";
}

function flowPath(wt: string, service: string, cycleId: string): string {
	return join(wt, ".tdd", service, cycleId, "flow.json");
}
