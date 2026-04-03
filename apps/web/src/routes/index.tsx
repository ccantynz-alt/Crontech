import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { Button, Stack, Text } from "@cronix/ui";
import { useAuth } from "../stores";

export default function Home(): ReturnType<typeof Stack> {
  const auth = useAuth();

  return (
    <Stack direction="vertical" align="center" justify="center" class="hero">
      <Title>Cronix</Title>
      <Text variant="h1" weight="bold" align="center" class="heading">
        Cronix
      </Text>
      <Text variant="body" align="center" class="tagline">
        The most advanced full-stack platform
      </Text>
      <Text variant="body" align="center" class="description">
        AI-native. Edge-first. Zero-HTML. Self-evolving.
      </Text>
      <Stack direction="horizontal" gap="md" justify="center">
        <Show
          when={auth.isAuthenticated()}
          fallback={
            <A href="/register">
              <Button variant="primary" size="lg">Get Started</Button>
            </A>
          }
        >
          <A href="/dashboard">
            <Button variant="primary" size="lg">Go to Dashboard</Button>
          </A>
        </Show>
        <A href="/about">
          <Button variant="outline" size="lg">Learn More</Button>
        </A>
      </Stack>
    </Stack>
  );
}
