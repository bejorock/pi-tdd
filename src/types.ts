export type TestRunner = "pytest" | "vitest" | "jest";

export interface ServiceConfig {
	dir: string;
	skill: string;
	runner: TestRunner;
	cmd: (testPaths: string[]) => string;
}

export interface TddFlow {
	service: string;
	cycleId: string;
	feature: string;
	step: string;
	locked: boolean;
	testPaths?: string[];
	attempts?: number;
}

export interface TddPointer {
	activeService: string;
	activeCycleId: string;
}

export type TddPhase = "architect" | "red-writer" | "red_verify" | "green-impl" | "green_verify" | "reviewer" | "done";

/** Gap found during /tdd:init analysis */
export interface InitGap {
	service: string;
	severity: "error" | "warn";
	message: string;
}

/** Result of /tdd:init */
export interface InitResult {
	services: Record<string, ServiceConfig>;
	gaps: InitGap[];
	agentsCreated: string[];
	configWritten: boolean;
}
