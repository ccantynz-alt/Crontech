import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";

export default function NotFound(): JSX.Element {
  return (
    <>
      <Title>404 - Page Not Found | Back to the Future</Title>
      <Stack direction="vertical" align="center" justify="center" class="page-center">
        <Card padding="lg" class="not-found-card">
          <Stack direction="vertical" gap="lg" align="center">
            <Text variant="h1" weight="bold" class="not-found-code">
              404
            </Text>
            <Text variant="h3" weight="semibold">
              Page not found
            </Text>
            <Text variant="body" class="text-muted" align="center">
              The page you are looking for does not exist or has been moved.
            </Text>
            <Stack direction="horizontal" gap="md" justify="center">
              <A href="/">
                <Button variant="primary" size="lg">
                  Back to Home
                </Button>
              </A>
              <A href="/dashboard">
                <Button variant="outline" size="lg">
                  Dashboard
                </Button>
              </A>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
