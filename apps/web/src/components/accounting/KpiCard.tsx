import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Card, Stack, Text } from "@back-to-the-future/ui";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
}

export function KpiCard(props: KpiCardProps): JSX.Element {
  return (
    <Card padding="md">
      <Stack direction="vertical" gap="xs">
        <Text variant="caption" class="text-muted">
          {props.label}
        </Text>
        <Text variant="h2" weight="bold">
          {props.value}
        </Text>
        <Show when={props.delta}>
          <Text variant="caption" class="text-muted">
            {props.delta}
          </Text>
        </Show>
        <Show when={props.hint}>
          <Text variant="caption" class="text-muted">
            {props.hint}
          </Text>
        </Show>
      </Stack>
    </Card>
  );
}
