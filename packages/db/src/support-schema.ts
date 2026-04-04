// ── Support Schema ──────────────────────────────────────────────
// Drizzle tables for the AI customer support system.
// Tracks conversations, messages, feedback, and tickets.

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

// ---------------------------------------------------------------------------
// Support Conversations
// ---------------------------------------------------------------------------

export const supportConversations = sqliteTable("support_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  sessionId: text("session_id").notNull().unique(),
  status: text("status", {
    enum: ["active", "resolved", "escalated"],
  })
    .notNull()
    .default("active"),
  category: text("category"),
  summary: text("summary"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Support Messages
// ---------------------------------------------------------------------------

export const supportMessages = sqliteTable("support_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => supportConversations.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: ["user", "assistant", "system"],
  }).notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"), // JSON-serialized tool call data
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Support Feedback
// ---------------------------------------------------------------------------

export const supportFeedback = sqliteTable("support_feedback", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => supportMessages.id, { onDelete: "cascade" }),
  rating: text("rating", {
    enum: ["positive", "negative"],
  }).notNull(),
  comment: text("comment"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Support Tickets
// ---------------------------------------------------------------------------

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(
    () => supportConversations.id,
    { onDelete: "set null" },
  ),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  priority: text("priority", {
    enum: ["low", "medium", "high", "critical"],
  })
    .notNull()
    .default("medium"),
  status: text("status", {
    enum: ["open", "in_progress", "resolved", "closed"],
  })
    .notNull()
    .default("open"),
  assignee: text("assignee"),
  summary: text("summary").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});
