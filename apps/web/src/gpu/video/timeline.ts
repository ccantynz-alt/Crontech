/**
 * Timeline state management for video editing.
 * Manages segments, effects, and undo/redo history.
 */

import type { VideoEffectParams } from "./effects";

export interface AppliedEffect {
  readonly id: string;
  readonly effectId: string;
  readonly params: VideoEffectParams;
}

export interface TimelineSegment {
  readonly id: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly effects: readonly AppliedEffect[];
}

interface TimelineSnapshot {
  readonly segments: readonly TimelineSegment[];
  readonly currentTime: number;
}

let nextSegmentId = 1;
let nextEffectId = 1;

function generateSegmentId(): string {
  return `seg_${nextSegmentId++}`;
}

function generateEffectId(): string {
  return `fx_${nextEffectId++}`;
}

export class Timeline {
  private _segments: TimelineSegment[];
  private _currentTime: number;
  private _duration: number;
  private _undoStack: TimelineSnapshot[];
  private _redoStack: TimelineSnapshot[];
  private readonly _maxHistory: number;

  constructor(duration: number) {
    this._segments = [];
    this._currentTime = 0;
    this._duration = duration;
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistory = 50;
  }

  get segments(): readonly TimelineSegment[] {
    return this._segments;
  }

  get currentTime(): number {
    return this._currentTime;
  }

  set currentTime(time: number) {
    this._currentTime = Math.max(0, Math.min(this._duration, time));
  }

  get duration(): number {
    return this._duration;
  }

  set duration(value: number) {
    this._duration = Math.max(0, value);
  }

  get canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  private saveSnapshot(): void {
    this._undoStack.push({
      segments: this._segments.map((s) => ({ ...s, effects: [...s.effects] })),
      currentTime: this._currentTime,
    });
    if (this._undoStack.length > this._maxHistory) {
      this._undoStack.shift();
    }
    // Clear redo stack on new action
    this._redoStack = [];
  }

  addSegment(start: number, end: number): TimelineSegment {
    this.saveSnapshot();
    const segment: TimelineSegment = {
      id: generateSegmentId(),
      startTime: Math.max(0, start),
      endTime: Math.min(this._duration, end),
      effects: [],
    };
    this._segments.push(segment);
    return segment;
  }

  removeSegment(id: string): void {
    const idx = this._segments.findIndex((s) => s.id === id);
    if (idx === -1) return;
    this.saveSnapshot();
    this._segments.splice(idx, 1);
  }

  split(segmentId: string, atTime: number): [TimelineSegment, TimelineSegment] | undefined {
    const idx = this._segments.findIndex((s) => s.id === segmentId);
    if (idx === -1) return undefined;
    const segment = this._segments[idx] as TimelineSegment;
    if (atTime <= segment.startTime || atTime >= segment.endTime) return undefined;

    this.saveSnapshot();

    const first: TimelineSegment = {
      id: generateSegmentId(),
      startTime: segment.startTime,
      endTime: atTime,
      effects: [...segment.effects],
    };
    const second: TimelineSegment = {
      id: generateSegmentId(),
      startTime: atTime,
      endTime: segment.endTime,
      effects: [...segment.effects],
    };

    this._segments.splice(idx, 1, first, second);
    return [first, second];
  }

  addEffect(
    segmentId: string,
    effectId: string,
    params: VideoEffectParams,
  ): AppliedEffect | undefined {
    const idx = this._segments.findIndex((s) => s.id === segmentId);
    if (idx === -1) return undefined;

    this.saveSnapshot();

    const effect: AppliedEffect = {
      id: generateEffectId(),
      effectId,
      params,
    };

    const segment = this._segments[idx] as TimelineSegment;
    this._segments[idx] = {
      ...segment,
      effects: [...segment.effects, effect],
    };

    return effect;
  }

  removeEffect(segmentId: string, effectInstanceId: string): void {
    const idx = this._segments.findIndex((s) => s.id === segmentId);
    if (idx === -1) return;
    const segment = this._segments[idx] as TimelineSegment;
    const fxIdx = segment.effects.findIndex((e) => e.id === effectInstanceId);
    if (fxIdx === -1) return;

    this.saveSnapshot();

    const newEffects = [...segment.effects];
    newEffects.splice(fxIdx, 1);
    this._segments[idx] = { ...segment, effects: newEffects };
  }

  updateEffectParams(segmentId: string, effectInstanceId: string, params: VideoEffectParams): void {
    const idx = this._segments.findIndex((s) => s.id === segmentId);
    if (idx === -1) return;
    const segment = this._segments[idx] as TimelineSegment;
    const fxIdx = segment.effects.findIndex((e) => e.id === effectInstanceId);
    if (fxIdx === -1) return;

    this.saveSnapshot();

    const newEffects = [...segment.effects];
    const existing = newEffects[fxIdx] as AppliedEffect;
    newEffects[fxIdx] = { ...existing, params };
    this._segments[idx] = { ...segment, effects: newEffects };
  }

  /** Get all effects that apply at a given time */
  getEffectsAtTime(time: number): readonly AppliedEffect[] {
    const results: AppliedEffect[] = [];
    for (const segment of this._segments) {
      if (time >= segment.startTime && time < segment.endTime) {
        results.push(...segment.effects);
      }
    }
    return results;
  }

  /** Get the segment that contains the given time */
  getSegmentAtTime(time: number): TimelineSegment | undefined {
    return this._segments.find((s) => time >= s.startTime && time < s.endTime);
  }

  undo(): void {
    const snapshot = this._undoStack.pop();
    if (!snapshot) return;

    this._redoStack.push({
      segments: this._segments.map((s) => ({ ...s, effects: [...s.effects] })),
      currentTime: this._currentTime,
    });

    this._segments = snapshot.segments.map((s) => ({ ...s, effects: [...s.effects] }));
    this._currentTime = snapshot.currentTime;
  }

  redo(): void {
    const snapshot = this._redoStack.pop();
    if (!snapshot) return;

    this._undoStack.push({
      segments: this._segments.map((s) => ({ ...s, effects: [...s.effects] })),
      currentTime: this._currentTime,
    });

    this._segments = snapshot.segments.map((s) => ({ ...s, effects: [...s.effects] }));
    this._currentTime = snapshot.currentTime;
  }

  /** Serialize timeline state for persistence */
  toJSON(): { segments: readonly TimelineSegment[]; duration: number; currentTime: number } {
    return {
      segments: this._segments,
      duration: this._duration,
      currentTime: this._currentTime,
    };
  }

  /** Restore from serialized state */
  static fromJSON(json: {
    segments: readonly TimelineSegment[];
    duration: number;
    currentTime: number;
  }): Timeline {
    const tl = new Timeline(json.duration);
    tl._segments = json.segments.map((s) => ({ ...s, effects: [...s.effects] }));
    tl._currentTime = json.currentTime;
    return tl;
  }
}
