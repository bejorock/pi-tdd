export type Mode = "build" | "plan" | "tdd";

export type TestRunner = "pytest" | "vitest" | "jest";

export interface ServiceConfig {
	dir: string;
	skill: string;
	runner: TestRunner;
	cmd: (testPaths: string[]) => string;
}

export interface TddFlow {
	service: string;
	feature: string;
	skill: string;
	dir: string;
	step: "architect" | "red-writer" | "red_verify" | "green-impl" | "green_verify" | "reviewer" | "done";
	testPaths: string[];
	planPath: string;
	cycleId: string;
	startedAt: string;
	locked: boolean;
}

export interface TddPointer {
	activeService: string;
	activeCycleId: string;
	services: string[];
}

export type TddPhase = "architect" | "red-writer" | "red_verify" | "green-impl" | "green_verify" | "reviewer" | "done";

export interface TestResult {
	failed: number;
	passed: number;
	ran: boolean;
	collectError: boolean;
	summary: string;
}

/** Gap found during /init analysis */
export interface InitGap {
	service: string;
	severity: "error" | "warn";
	message: string;
}

/** Result of /init */
export interface InitResult {
	services: Record<string, ServiceConfig>;
	gaps: InitGap[];
	agentsCreated: string[];
	configWritten: boolean;
}
