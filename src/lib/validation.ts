import { z } from "zod";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const passwordSchema = z
  .string()
  .min(10, "weak")
  .max(128, "weak")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "weak");

export const registerSchema = z.object({
  fullName: trimmed(2, 120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  confirmPassword: z.string(),
  role: z.enum(["requester", "donor"]), // 'admin' can never be chosen at signup
  acceptTerms: z.literal(true),
}).refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "mismatch" });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const resetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const newPasswordSchema = z.object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "mismatch" });

export const profileSchema = z.object({
  fullName: trimmed(2, 120),
  phone: z.string().trim().regex(/^[+0-9 -]{7,20}$/, "phone").or(z.literal("")),
  city: z.string().trim().max(80),
  bio: z.string().trim().max(500),
  locale: z.enum(["en", "ur"]),
  emailNotifications: z.boolean().default(true),
});

export const UTILITY_TYPES = ["electricity", "gas", "water", "internet", "phone", "other"] as const;

export const requestSchema = z.object({
  title: trimmed(5, 120),
  description: trimmed(20, 2000),
  utilityType: z.enum(UTILITY_TYPES),
  providerName: trimmed(2, 80),
  city: trimmed(2, 80),
  amountDue: z.coerce.number().positive().max(500000).multipleOf(0.01),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), "date"),
  hardshipNote: z.string().trim().max(1000).optional().default(""),
  consumerRef: z.string().trim().min(4).max(40).regex(/^[A-Za-z0-9 -]+$/, "ref"),
  accountTitle: z.string().trim().max(120).optional().default(""),
  paymentNote: z.string().trim().max(300).optional().default(""),
});
export type RequestInput = z.infer<typeof requestSchema>;

export const questionSchema = z.object({ requestId: z.string().uuid(), question: trimmed(10, 1000) });
export const answerSchema = z.object({ infoId: z.string().uuid(), response: trimmed(2, 2000) });
export const reviewSchema = z.object({ requestId: z.string().uuid(), note: z.string().trim().max(1000).optional().default("") });
export const messageSchema = z.object({ threadId: z.string().uuid(), body: trimmed(1, 2000) });
export const disputeSchema = z.object({ paymentId: z.string().uuid(), reason: trimmed(10, 1000) });
export const disputeResponseSchema = z.object({ paymentId: z.string().uuid(), response: trimmed(5, 1000) });
export const confirmSchema = z.object({ paymentId: z.string().uuid(), note: z.string().trim().max(1000).optional().default("") });

export const paymentSchema = z.object({
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive().max(500000).multipleOf(0.01),
  method: z.enum(["easypaisa", "jazzcash", "bank_app", "other"]),
  transactionRef: z.string().trim().regex(/^[A-Za-z0-9._-]{4,64}$/, "txref"),
  paidAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), "date"),
  receiptDocumentId: z.string().uuid(),
});

export const reportSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.enum(["fake_bill", "altered_bill", "duplicate", "inappropriate", "harassment", "other"]),
  details: z.string().trim().max(1000).optional().default(""),
});

export const contactSchema = z.object({
  name: trimmed(1, 120),
  email: z.string().trim().email().max(254),
  message: trimmed(10, 3000),
});

export const redactionSchema = z.object({
  top: z.coerce.number().min(0).max(60).default(0),
  bottom: z.coerce.number().min(0).max(60).default(0),
  left: z.coerce.number().min(0).max(60).default(0),
  right: z.coerce.number().min(0).max(60).default(0),
  blurAll: z.coerce.boolean().default(false),
});

export const browseSchema = z.object({
  q: z.string().trim().max(80).optional(),
  type: z.enum(UTILITY_TYPES).optional(),
  city: z.string().trim().max(80).optional(),
  min: z.coerce.number().min(0).max(500000).optional(),
  max: z.coerce.number().min(0).max(500000).optional(),
  sort: z.enum(["newest", "due", "remaining"]).optional().default("newest"),
  open: z.enum(["1", "0"]).optional().default("1"),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});
