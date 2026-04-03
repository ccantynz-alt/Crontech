import { assign, setup } from "xstate";

export interface AuthContext {
  userId: string | null;
  email: string | null;
  error: string | null;
  retryCount: number;
}

export type AuthEvent =
  | { type: "REGISTER"; email: string }
  | { type: "LOGIN"; email: string }
  | { type: "LOGOUT" }
  | { type: "AUTH_SUCCESS"; userId: string; email: string }
  | { type: "AUTH_FAILURE"; error: string }
  | { type: "RETRY" };

export const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as AuthEvent,
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < 3,
  },
  actions: {
    setUser: assign(({ event }) => {
      const e = event as AuthEvent & { type: "AUTH_SUCCESS" };
      return {
        userId: e.userId,
        email: e.email,
        error: null,
        retryCount: 0,
      };
    }),
    setError: assign(({ event }) => {
      const e = event as AuthEvent & { type: "AUTH_FAILURE" };
      return {
        error: e.error,
      };
    }),
    incrementRetry: assign(({ context }) => ({
      retryCount: context.retryCount + 1,
    })),
    clearError: assign({
      error: () => null,
    }),
    clearUser: assign({
      userId: () => null,
      email: () => null,
      error: () => null,
      retryCount: () => 0,
    }),
  },
}).createMachine({
  id: "auth",
  initial: "idle",
  context: {
    userId: null,
    email: null,
    error: null,
    retryCount: 0,
  },
  states: {
    idle: {
      on: {
        REGISTER: {
          target: "registering",
          actions: [{ type: "clearError" }],
        },
        LOGIN: {
          target: "authenticating",
          actions: [{ type: "clearError" }],
        },
      },
    },
    registering: {
      on: {
        AUTH_SUCCESS: {
          target: "authenticated",
          actions: [{ type: "setUser" }],
        },
        AUTH_FAILURE: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    authenticating: {
      on: {
        AUTH_SUCCESS: {
          target: "authenticated",
          actions: [{ type: "setUser" }],
        },
        AUTH_FAILURE: {
          target: "error",
          actions: [{ type: "setError" }],
        },
      },
    },
    authenticated: {
      on: {
        LOGOUT: {
          target: "idle",
          actions: [{ type: "clearUser" }],
        },
      },
    },
    error: {
      on: {
        RETRY: [
          {
            target: "authenticating",
            guard: "canRetry",
            actions: [{ type: "incrementRetry" }, { type: "clearError" }],
          },
        ],
        LOGIN: {
          target: "authenticating",
          actions: [{ type: "clearError" }],
        },
        REGISTER: {
          target: "registering",
          actions: [{ type: "clearError" }],
        },
      },
    },
  },
});

export type AuthMachine = typeof authMachine;
