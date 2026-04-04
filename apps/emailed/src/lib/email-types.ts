import { z } from "zod";

/** Zod schema for email attachments */
export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonneg(),
  url: z.string().url(),
  checksum: z.string().optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

/** Zod schema for email contacts */
export const ContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().optional(),
  isFrequent: z.boolean().default(false),
});

export type Contact = z.infer<typeof ContactSchema>;

/** AI classification categories for emails */
export const AIClassificationCategorySchema = z.enum([
  "important",
  "newsletter",
  "social",
  "promotions",
  "spam",
  "updates",
  "finance",
  "travel",
]);

export type AIClassificationCategory = z.infer<typeof AIClassificationCategorySchema>;

/** Zod schema for AI classification results */
export const AIClassificationSchema = z.object({
  category: AIClassificationCategorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedLabels: z.array(z.string()),
  priority: z.enum(["high", "medium", "low"]),
  isActionRequired: z.boolean(),
});

export type AIClassification = z.infer<typeof AIClassificationSchema>;

/** Zod schema for a single email */
export const EmailSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  from: ContactSchema,
  to: z.array(ContactSchema).min(1),
  cc: z.array(ContactSchema).default([]),
  bcc: z.array(ContactSchema).default([]),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().optional(),
  attachments: z.array(AttachmentSchema).default([]),
  isRead: z.boolean().default(false),
  isStarred: z.boolean().default(false),
  isDraft: z.boolean().default(false),
  sentAt: z.string().datetime(),
  receivedAt: z.string().datetime().optional(),
  classification: AIClassificationSchema.optional(),
  labels: z.array(z.string()).default([]),
  inReplyTo: z.string().uuid().optional(),
});

export type Email = z.infer<typeof EmailSchema>;

/** Zod schema for an email thread */
export const ThreadSchema = z.object({
  id: z.string().uuid(),
  subject: z.string(),
  emails: z.array(EmailSchema).min(1),
  participants: z.array(ContactSchema),
  lastActivityAt: z.string().datetime(),
  isUnread: z.boolean().default(false),
  snippet: z.string(),
  messageCount: z.number().int().positive(),
  labels: z.array(z.string()).default([]),
});

export type Thread = z.infer<typeof ThreadSchema>;

/** Zod schema for email folders */
export const FolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  icon: z.string().optional(),
  unreadCount: z.number().int().nonneg().default(0),
  totalCount: z.number().int().nonneg().default(0),
  isSystem: z.boolean().default(false),
  isAISorted: z.boolean().default(false),
  parentId: z.string().uuid().optional(),
  color: z.string().optional(),
});

export type Folder = z.infer<typeof FolderSchema>;
