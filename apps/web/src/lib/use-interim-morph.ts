// ── useInterimMorph — live layout speculation while the user speaks ────
//
// Debounces interim (partial) transcripts from VoicePill at 400 ms and
// fires a speculative `trpc.ai.siteBuilder.generate` mutation so the
// builder preview morphs BEFORE the sentence finishes. When the final
// transcript arrives any in-flight speculation is cancelled and a fresh
// authoritative generation fires.
//
// The `isSpeculating` signal lets the caller dim or badge the preview
// to communicate to the user that the result is provisional.

import type { PageLayout } from "@back-to-the-future/ai-core";
import { createSignal, onCleanup } from "solid-js";
import { computeTier } from "./ai-client";
import { trpc } from "./trpc";

export interface InterimMorphControls {
  /** Wire to VoicePill's `onInterimTranscript` prop. */
  onInterimTranscript: (interim: string) => void;
  /** Wire to VoicePill's `onTranscript` prop (replaces/wraps existing handler). */
  onFinalTranscript: (final: string) => void;
  /** True while a speculative or authoritative generation is in-flight. */
  isSpeculating: () => boolean;
}

/**
 * Connects VoicePill's interim stream to live layout generation.
 *
 * @param onLayout - Called every time a layout is received (speculative or final).
 */
export function useInterimMorph(onLayout: (layout: PageLayout) => void): InterimMorphControls {
  const [isSpeculating, setIsSpeculating] = createSignal(false);

  // AbortController-style token: increment to cancel the previous async chain.
  let generationEpoch = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDebounce(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  /** Fire a layout generation and apply the result if still current epoch. */
  async function fireGeneration(text: string, epoch: number): Promise<void> {
    setIsSpeculating(true);
    try {
      const result = await trpc.ai.siteBuilder.generate.mutate({
        prompt: text,
        tier: computeTier(),
      });
      // Only apply if no newer generation superseded this one.
      if (epoch === generationEpoch) {
        onLayout(result.layout);
      }
    } catch {
      // Speculation failures are silent — the user's sentence isn't done yet,
      // or the final transcript will retry. Do not surface an error here.
    } finally {
      if (epoch === generationEpoch) {
        setIsSpeculating(false);
      }
    }
  }

  function onInterimTranscript(interim: string): void {
    // Skip empty / whitespace-only partials.
    if (!interim.trim()) return;

    // Debounce: wait 400 ms of silence before speculating.
    clearDebounce();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      generationEpoch += 1;
      void fireGeneration(interim, generationEpoch);
    }, 400);
  }

  function onFinalTranscript(final: string): void {
    // Cancel any pending debounce — the final transcript wins.
    clearDebounce();
    if (!final.trim()) {
      setIsSpeculating(false);
      return;
    }
    // Supersede any in-flight speculative generation.
    generationEpoch += 1;
    void fireGeneration(final, generationEpoch);
  }

  onCleanup(() => {
    clearDebounce();
    // Invalidate any in-flight async chains by advancing the epoch.
    generationEpoch += 1;
  });

  return { onInterimTranscript, onFinalTranscript, isSpeculating };
}
