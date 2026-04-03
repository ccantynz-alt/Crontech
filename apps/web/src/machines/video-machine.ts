import { assign, setup } from "xstate";

export interface VideoContext {
  timeline: unknown;
  selectedClipId: string | null;
  renderProgress: number;
  error: string | null;
}

export type VideoEvent =
  | { type: "IMPORT_CLIP"; clipData: unknown }
  | { type: "SELECT_CLIP"; clipId: string }
  | { type: "ADD_EFFECT"; effect: unknown }
  | { type: "REMOVE_CLIP"; clipId: string }
  | { type: "START_RENDER" }
  | { type: "RENDER_COMPLETE" }
  | { type: "EXPORT" }
  | { type: "ERROR"; error: string };

export const videoMachine = setup({
  types: {
    context: {} as VideoContext,
    events: {} as VideoEvent,
  },
  actions: {
    selectClip: assign(({ event }) => {
      const e = event as VideoEvent & { type: "SELECT_CLIP" };
      return { selectedClipId: e.clipId };
    }),
    clearSelection: assign({
      selectedClipId: () => null,
    }),
    resetRender: assign({
      renderProgress: () => 0,
    }),
    completeRender: assign({
      renderProgress: () => 100,
    }),
    resetAfterExport: assign({
      renderProgress: () => 0,
      selectedClipId: () => null,
    }),
    setError: assign(({ event }) => {
      const e = event as VideoEvent & { type: "ERROR" };
      return { error: e.error };
    }),
    setErrorAndResetRender: assign(({ event }) => {
      const e = event as VideoEvent & { type: "ERROR" };
      return { error: e.error, renderProgress: 0 };
    }),
    clearError: assign({
      error: () => null,
    }),
    clearErrorAndSelectClip: assign(({ event }) => {
      const e = event as VideoEvent & { type: "SELECT_CLIP" };
      return { error: null, selectedClipId: e.clipId };
    }),
  },
}).createMachine({
  id: "video",
  initial: "idle",
  context: {
    timeline: { tracks: [], duration: 0 },
    selectedClipId: null,
    renderProgress: 0,
    error: null,
  },
  states: {
    idle: {
      on: {
        IMPORT_CLIP: { target: "importing" },
      },
    },
    importing: {
      on: {
        SELECT_CLIP: {
          target: "editing",
          actions: [{ type: "selectClip" }],
        },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    editing: {
      on: {
        IMPORT_CLIP: { target: "importing" },
        SELECT_CLIP: {
          actions: [{ type: "selectClip" }],
        },
        ADD_EFFECT: {},
        REMOVE_CLIP: {
          actions: [{ type: "clearSelection" }],
        },
        START_RENDER: {
          target: "rendering",
          actions: [{ type: "resetRender" }],
        },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    rendering: {
      on: {
        RENDER_COMPLETE: {
          target: "exporting",
          actions: [{ type: "completeRender" }],
        },
        ERROR: {
          target: "error",
          actions: [{ type: "setErrorAndResetRender" }],
        },
      },
    },
    exporting: {
      on: {
        EXPORT: {
          target: "idle",
          actions: [{ type: "resetAfterExport" }],
        },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    error: {
      on: {
        IMPORT_CLIP: {
          target: "importing",
          actions: [{ type: "clearError" }],
        },
        SELECT_CLIP: {
          target: "editing",
          actions: [{ type: "clearErrorAndSelectClip" }],
        },
      },
    },
  },
});

export type VideoMachine = typeof videoMachine;
