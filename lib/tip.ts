import { z } from "zod";

/**
 * a tip from the contact notepad. browser checks it before sending and functions/api/tip.ts
 * checks again, same schema so they never disagree
 */
export const tipSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Your name, detective.")
    .max(80, "Keep the name under 80 characters.")
    .refine((v) => !/[\r\n]/.test(v), "One line for the name."),
  email: z.email("An address the reply can go to.").max(120, "Keep the address under 120 characters."),
  message: z.string().trim().min(10, "A few more words: at least 10 characters.").max(2000, "Keep it under 2,000 characters."),
  token: z.string().min(1, "Finish the robot check first."),
});

export type Tip = z.infer<typeof tipSchema>;

/** what /api/tip returns */
export type TipResponse = { ok: true } | { ok: false; error: string };
