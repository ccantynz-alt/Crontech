import { assign, setup } from "xstate";

export interface BuilderContext {
  components: unknown[];
  selectedComponent: string | null;
  prompt: string;
  error: string | null;
}

export type BuilderEvent =
  | { type: "START_COMPOSE" }
  | { type: "GENERATE"; prompt: string }
  | { type: "PREVIEW" }
  | { type: "EDIT"; componentId: string }
  | { type: "SAVE" }
  | { type: "CANCEL" }
  | { type: "ERROR"; error: string }
  | { type: "RETRY" };

export const builderMachine = setup({
  types: {
    context: {} as BuilderContext,
    events: {} as BuilderEvent,
  },
  actions: {
    setPrompt: assign(({ event }) => {
      const e = event as BuilderEvent & { type: "GENERATE" };
      return { prompt: e.prompt };
    }),
    setError: assign(({ event }) => {
      const e = event as BuilderEvent & { type: "ERROR" };
      return { error: e.error };
    }),
    clearError: assign({
      error: () => null,
    }),
    selectComponent: assign(({ event }) => {
      const e = event as BuilderEvent & { type: "EDIT" };
      return { selectedComponent: e.componentId };
    }),
    resetSelection: assign({
      error: () => null,
      selectedComponent: () => null,
    }),
  },
}).createMachine({
  id: "builder",
  initial: "idle",
  context: {
    components: [],
    selectedComponent: null,
    prompt: "",
    error: null,
  },
  states: {
    idle: {
      on: {
        START_COMPOSE: { target: "composing" },
      },
    },
    composing: {
      on: {
        GENERATE: {
          target: "generating",
          actions: [{ type: "setPrompt" }],
        },
        CANCEL: { target: "idle" },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    generating: {
      on: {
        PREVIEW: {
          target: "previewing",
          actions: [{ type: "clearError" }],
        },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
        CANCEL: { target: "composing" },
      },
    },
    previewing: {
      on: {
        EDIT: {
          target: "editing",
          actions: [{ type: "selectComponent" }],
        },
        SAVE: { target: "saving" },
        CANCEL: { target: "composing" },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    editing: {
      on: {
        PREVIEW: { target: "previewing" },
        SAVE: { target: "saving" },
        CANCEL: { target: "previewing" },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    saving: {
      on: {
        START_COMPOSE: {
          target: "composing",
          actions: [{ type: "resetSelection" }],
        },
        ERROR: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    error: {
      on: {
        RETRY: {
          target: "composing",
          actions: [{ type: "clearError" }],
        },
        CANCEL: {
          target: "idle",
          actions: [{ type: "clearError" }],
        },
      },
    },
  },
});

export type BuilderMachine = typeof builderMachine;
