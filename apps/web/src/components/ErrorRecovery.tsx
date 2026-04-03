import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";
import { Card } from "@back-to-the-future/ui";
import { Button } from "@back-to-the-future/ui";

export interface ErrorRecoveryProps {
  error: string;
  componentName?: string;
  retryCount?: number;
  onRetry: () => void;
}

/**
 * Recovery overlay displayed when an AIErrorBoundary catches an error.
 * Shows the error in a Card with retry and report actions.
 */
export function ErrorRecovery(props: ErrorRecoveryProps): JSX.Element {
  const [reported, setReported] = createSignal(false);

  const handleReport = (): void => {
    // Placeholder: in production this would send the error to a reporting service
    console.log("[ErrorRecovery] Error reported:", {
      error: props.error,
      componentName: props.componentName,
      retryCount: props.retryCount,
    });
    setReported(true);
  };

  return (
    <div class="flex items-center justify-center p-6">
      <Card
        title="Something went wrong"
        padding="lg"
        class="max-w-lg w-full border border-red-200 bg-red-50"
      >
        <div class="flex flex-col gap-4">
          <Show when={props.componentName && props.componentName !== "Unknown"}>
            <p class="text-sm text-gray-500">
              Failed component:{" "}
              <span class="font-mono font-semibold text-gray-700">
                {props.componentName}
              </span>
            </p>
          </Show>

          <div class="rounded bg-red-100 p-3">
            <p class="text-sm text-red-800 font-mono break-words">
              {props.error}
            </p>
          </div>

          <Show when={(props.retryCount ?? 0) > 0}>
            <p class="text-xs text-gray-400">
              Retry attempts: {props.retryCount}
            </p>
          </Show>

          <div class="flex gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={props.onRetry}
            >
              Retry
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={reported()}
              onClick={handleReport}
            >
              {reported() ? "Reported" : "Report"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
