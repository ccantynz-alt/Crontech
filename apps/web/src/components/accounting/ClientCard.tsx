import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Card, Stack, Text, Avatar } from "@back-to-the-future/ui";

interface ClientCardProps {
  name: string;
  email: string;
  company?: string | null;
  contactPerson?: string | null;
  onClick?: () => void;
}

export function ClientCard(props: ClientCardProps): JSX.Element {
  return (
    <Card padding="md">
      <Stack direction="horizontal" gap="md" align="center">
        <Avatar
          initials={props.name.charAt(0).toUpperCase()}
          alt={props.name}
          size="md"
        />
        <Stack direction="vertical" gap="xs">
          <Text variant="body" weight="semibold">
            {props.name}
          </Text>
          <Text variant="caption" class="text-muted">
            {props.email}
          </Text>
          <Show when={props.company}>
            <Text variant="caption" class="text-muted">
              {props.company}
            </Text>
          </Show>
        </Stack>
      </Stack>
    </Card>
  );
}
