import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["tests/*.integration.ts"], testTimeout: 50_000, fileParallelism: false } });
