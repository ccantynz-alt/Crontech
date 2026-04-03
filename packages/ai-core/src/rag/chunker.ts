// ── Text Chunking Utilities ──────────────────────────────────────
// Splits text into overlapping chunks for embedding and retrieval.
// Respects sentence and paragraph boundaries to preserve meaning.

import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────

export const ChunkOptionsSchema = z.object({
  /** Maximum number of characters per chunk */
  chunkSize: z.number().int().min(50).max(100_000).default(1000),
  /** Number of overlapping characters between consecutive chunks */
  chunkOverlap: z.number().int().min(0).max(50_000).default(200),
  /** Whether to respect sentence boundaries when splitting */
  respectSentences: z.boolean().default(true),
  /** Whether to respect paragraph boundaries when splitting */
  respectParagraphs: z.boolean().default(true),
});

export type ChunkOptions = z.infer<typeof ChunkOptionsSchema>;

export const TextChunkSchema = z.object({
  /** The text content of this chunk */
  content: z.string(),
  /** Zero-based index of this chunk in the sequence */
  index: z.number().int().min(0),
  /** Character offset of this chunk's start in the original text */
  startOffset: z.number().int().min(0),
  /** Character offset of this chunk's end in the original text */
  endOffset: z.number().int().min(0),
  /** Total number of chunks produced from the source text */
  totalChunks: z.number().int().min(1),
});

export type TextChunk = z.infer<typeof TextChunkSchema>;

// ── Sentence / Paragraph Splitting ───────────────────────────────

/**
 * Splits text into sentences using common sentence-ending punctuation.
 * Keeps the punctuation attached to the sentence.
 */
function splitSentences(text: string): string[] {
  // Match sentence-ending punctuation followed by whitespace or end of string.
  // This regex handles ". ", "! ", "? ", and similar endings.
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter((s) => s.length > 0);
}

/**
 * Splits text into paragraphs (separated by one or more blank lines).
 */
function splitParagraphs(text: string): string[] {
  const parts = text.split(/\n\s*\n/);
  return parts.filter((p) => p.trim().length > 0);
}

// ── Core Chunking ────────────────────────────────────────────────

/**
 * Chunks text into overlapping segments using a sliding window.
 *
 * When `respectParagraphs` is true, the chunker first splits by paragraphs
 * and then groups them into chunks that fit within `chunkSize`.
 *
 * When `respectSentences` is true and a paragraph exceeds `chunkSize`,
 * sentences are grouped to stay within the size limit.
 *
 * Overlap is applied by including trailing content from the previous chunk
 * at the start of the next chunk.
 */
export function chunkText(
  text: string,
  options?: Partial<ChunkOptions>,
): TextChunk[] {
  const opts = ChunkOptionsSchema.parse(options ?? {});

  if (opts.chunkOverlap >= opts.chunkSize) {
    throw new Error(
      `chunkOverlap (${opts.chunkOverlap}) must be less than chunkSize (${opts.chunkSize})`,
    );
  }

  if (text.trim().length === 0) {
    return [];
  }

  // If the entire text fits in one chunk, return it directly
  if (text.length <= opts.chunkSize) {
    return [
      {
        content: text,
        index: 0,
        startOffset: 0,
        endOffset: text.length,
        totalChunks: 1,
      },
    ];
  }

  // Build a list of atomic segments that we will group into chunks
  const segments = buildSegments(text, opts);

  // Group segments into chunks with overlap
  const rawChunks = groupSegmentsIntoChunks(segments, opts);

  // Build final TextChunk objects with correct offsets
  const totalChunks = rawChunks.length;
  return rawChunks.map((chunk, index) => ({
    content: chunk.content,
    index,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    totalChunks,
  }));
}

// ── Internal Helpers ─────────────────────────────────────────────

interface Segment {
  content: string;
  startOffset: number;
  endOffset: number;
}

interface RawChunk {
  content: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Breaks text into the smallest meaningful segments based on options.
 */
function buildSegments(text: string, opts: ChunkOptions): Segment[] {
  const segments: Segment[] = [];

  if (opts.respectParagraphs) {
    const paragraphs = splitParagraphs(text);
    let searchFrom = 0;

    for (const para of paragraphs) {
      const paraStart = text.indexOf(para, searchFrom);
      const start = paraStart >= 0 ? paraStart : searchFrom;
      const end = start + para.length;
      searchFrom = end;

      // If a paragraph is larger than chunkSize, split further
      if (para.length > opts.chunkSize && opts.respectSentences) {
        const subSegments = splitIntoSentenceSegments(para, start);
        segments.push(...subSegments);
      } else if (para.length > opts.chunkSize) {
        // Hard split at chunkSize boundaries
        const hardSegments = hardSplit(para, start, opts.chunkSize);
        segments.push(...hardSegments);
      } else {
        segments.push({ content: para, startOffset: start, endOffset: end });
      }
    }
  } else if (opts.respectSentences) {
    segments.push(...splitIntoSentenceSegments(text, 0));
  } else {
    // Pure character-based splitting
    return hardSplit(text, 0, opts.chunkSize);
  }

  return segments;
}

function splitIntoSentenceSegments(
  text: string,
  baseOffset: number,
): Segment[] {
  const sentences = splitSentences(text);
  const segments: Segment[] = [];
  let searchFrom = 0;

  for (const sentence of sentences) {
    const sentenceStart = text.indexOf(sentence, searchFrom);
    const start = sentenceStart >= 0 ? sentenceStart : searchFrom;
    const end = start + sentence.length;
    searchFrom = end;

    segments.push({
      content: sentence,
      startOffset: baseOffset + start,
      endOffset: baseOffset + end,
    });
  }

  return segments;
}

function hardSplit(
  text: string,
  baseOffset: number,
  size: number,
): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i += size) {
    const slice = text.slice(i, i + size);
    segments.push({
      content: slice,
      startOffset: baseOffset + i,
      endOffset: baseOffset + i + slice.length,
    });
  }
  return segments;
}

/**
 * Groups atomic segments into chunks that fit within chunkSize,
 * applying overlap between consecutive chunks.
 */
function groupSegmentsIntoChunks(
  segments: Segment[],
  opts: ChunkOptions,
): RawChunk[] {
  if (segments.length === 0) return [];

  const chunks: RawChunk[] = [];

  let currentContent = "";
  let currentStart = segments[0]?.startOffset ?? 0;
  let currentEnd = currentStart;

  for (const segment of segments) {
    const wouldBeLength = currentContent.length > 0
      ? currentContent.length + 1 + segment.content.length // +1 for separator
      : segment.content.length;

    if (wouldBeLength > opts.chunkSize && currentContent.length > 0) {
      // Flush current chunk
      chunks.push({
        content: currentContent,
        startOffset: currentStart,
        endOffset: currentEnd,
      });

      // Apply overlap: take trailing characters from the flushed chunk
      if (opts.chunkOverlap > 0 && currentContent.length > opts.chunkOverlap) {
        const overlapText = currentContent.slice(-opts.chunkOverlap);
        currentContent = overlapText + " " + segment.content;
        currentStart = currentEnd - opts.chunkOverlap;
      } else {
        currentContent = segment.content;
        currentStart = segment.startOffset;
      }
      currentEnd = segment.endOffset;
    } else {
      // Append to current chunk
      if (currentContent.length > 0) {
        currentContent += " " + segment.content;
      } else {
        currentContent = segment.content;
        currentStart = segment.startOffset;
      }
      currentEnd = segment.endOffset;
    }
  }

  // Flush final chunk
  if (currentContent.length > 0) {
    chunks.push({
      content: currentContent,
      startOffset: currentStart,
      endOffset: currentEnd,
    });
  }

  return chunks;
}
