import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TddFlow, TddPointer } from "./types";

const FLOW_POINTER_PATH = ".tdd/flow.json";

// ---- Pointer: .tdd/flow.json (active service + cycle) ----
export function readPointer(wt: string): TddPointer | null {
	const p = join(wt, FLOW_POINTER_PATH);
	if (!existsSync(p)) return null;
	try { return JSON.parse(readFileSync(p, "utf8")) as TddPointer; } catch { return null; }
}

export function writePointer(wt: string, ptr: TddPointer): void {
	mkdirSync(join(wt, ".tdd"), { recursive: true });
	writeFileSync(join(wt, ".tdd", "flow.json"), JSON.stringify(ptr, null, 2));
}

// ---- Flow: .tdd/<service>/<cycleId>/flow.json ----
export function readFlow(wt: string, service: string, cycleId: string): TddFlow | null {
	const p = join(wt, cycleFlowDir(service, cycleId), "flow.json");
	if (!existsSync(p)) return null;
	try { return JSON.parse(readFileSync(p, "utf8")) as TddFlow; } catch { return null; }
}

export function writeFlow(wt: string, service: string, flow: TddFlow): void {
	const dir = join(wt, cycleFlowDir(service, flow.cycleId));
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "flow.json"), JSON.stringify(flow, null, 2));
}

export function advanceFlow(wt: string, service: string, cycleId: string, step: TddFlow["step"]): void {
	const flow = readFlow(wt, service, cycleId);
	if (!flow) throw new Error(`Flow not found: ${service}/${cycleId}`);
	flow.step = step;
	writeFlow(wt, service, flow);
}

export function activeServiceFlow(wt: string): TddFlow | null {
	const ptr = readPointer(wt);
	if (!ptr) return null;
	return readFlow(wt, ptr.activeService, ptr.activeCycleId);
}

// ---- Cycle helpers ----
export function cycleId(): string {
	return Math.random().toString(36).slice(2, 8);
}

export function cyclePlanPath(service: string, cycleId: string): string {
	return `.tdd/${service}/${cycleId}/PLAN.md`;
}

export function cycleFlowDir(service: string, cycleId: string): string {
	return `.tdd/${service}/${cycleId}`;
}

export function cycleIdFromPath(planPath: string): string {
	return dirname(planPath).split("/").pop()!;
}

export function activeCycleDir(wt: string): string | null {
	const ptr = readPointer(wt);
	if (!ptr) return null;
	return `.tdd/${ptr.activeService}/${ptr.activeCycleId}`;
}
