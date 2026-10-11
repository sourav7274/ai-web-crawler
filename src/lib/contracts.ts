import { z } from "zod";
export const requestSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();
export const summarySchema = z.object({
  overview: z.string().trim().min(1).max(3000),
  keyPoints: z.array(z.string().trim().min(1).max(1000)).min(3).max(5),
});
export const resultSchema = summarySchema.extend({
  title: z.string(), sourceUrl: z.string().url(), truncated: z.boolean(),
});
export type SummaryResult = z.infer<typeof resultSchema>;
export class AppError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message); this.name = "AppError";
  }
}
