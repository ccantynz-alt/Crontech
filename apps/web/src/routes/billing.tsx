import { Title } from "@solidjs/meta";
import { Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";

export default function BillingPage(): JSX.Element {
  const [currentPlan] = createSignal("Free");

  return (
    <ProtectedRoute>
      <Title>Billing - Back to the Future</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">Billing</Text>
          <Text variant="body" class="text-muted">
            Manage your subscription and payment methods.
          </Text>
        </Stack>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">Current Plan</Text>
            <Stack direction="horizontal" gap="sm" align="center">
              <Text variant="h2" weight="bold">{currentPlan()}</Text>
              <Badge variant="info" size="sm">Active</Badge>
            </Stack>
            <Text variant="body" class="text-muted">
              Your plan renews automatically. Upgrade anytime to unlock more features.
            </Text>
            <Stack direction="horizontal" gap="sm">
              <Button variant="primary">Upgrade Plan</Button>
              <Button variant="outline">Manage Billing</Button>
            </Stack>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">Usage This Period</Text>
            <div class="grid-3">
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="caption" class="text-muted">AI Generations</Text>
                  <Text variant="h3" weight="bold">12 / 50</Text>
                </Stack>
              </Card>
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="caption" class="text-muted">Projects</Text>
                  <Text variant="h3" weight="bold">1 / 1</Text>
                </Stack>
              </Card>
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="caption" class="text-muted">Storage</Text>
                  <Text variant="h3" weight="bold">24 MB</Text>
                </Stack>
              </Card>
            </div>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">Payment History</Text>
            <Text variant="body" class="text-muted">
              No payments yet. Upgrade to see your billing history.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </ProtectedRoute>
  );
}
