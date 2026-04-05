import { Title } from "@solidjs/meta";
import { Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Input, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth, useTheme } from "../stores";

function Section(props: { title: string; description: string; children: JSX.Element }): JSX.Element {
  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Stack direction="vertical" gap="xs">
          <Text variant="h4" weight="semibold">{props.title}</Text>
          <Text variant="caption" class="text-muted">{props.description}</Text>
        </Stack>
        {props.children}
      </Stack>
    </Card>
  );
}

export default function SettingsPage(): JSX.Element {
  const auth = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [displayName, setDisplayName] = createSignal(auth.currentUser()?.displayName ?? "");
  const [profileSaved, setProfileSaved] = createSignal(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);

  const handleSaveProfile = (): void => {
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  return (
    <ProtectedRoute>
      <Title>Settings - Back to the Future</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">Settings</Text>
          <Text variant="body" class="text-muted">
            Manage your account, preferences, and integrations.
          </Text>
        </Stack>

        <Section title="Profile" description="Update your personal information.">
          <Stack direction="vertical" gap="md">
            <Input
              label="Display Name"
              type="text"
              value={displayName()}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
              placeholder="Your display name"
            />
            <Input
              label="Email"
              type="email"
              value={auth.currentUser()?.email ?? ""}
              disabled
              placeholder="Email cannot be changed"
            />
            <Stack direction="horizontal" gap="sm" align="center">
              <Button variant="primary" size="sm" onClick={handleSaveProfile}>
                Save Changes
              </Button>
              <Show when={profileSaved()}>
                <Badge variant="success" size="sm">Saved</Badge>
              </Show>
            </Stack>
          </Stack>
        </Section>

        <Section title="Appearance" description="Customize the look and feel.">
          <Stack direction="horizontal" gap="md">
            <Button
              variant={!isDark() ? "primary" : "outline"}
              size="sm"
              onClick={() => { if (isDark()) toggleTheme(); }}
            >
              Light Mode
            </Button>
            <Button
              variant={isDark() ? "primary" : "outline"}
              size="sm"
              onClick={() => { if (!isDark()) toggleTheme(); }}
            >
              Dark Mode
            </Button>
          </Stack>
        </Section>

        <Section title="API Keys" description="Manage your API keys for programmatic access.">
          <Stack direction="vertical" gap="md">
            <Stack direction="horizontal" gap="sm" align="center">
              <code class="api-key-value">btf_sk_xxxxxxxxxxxxxxxx</code>
              <Button variant="outline" size="sm">Copy</Button>
            </Stack>
            <Text variant="caption" class="text-muted">
              Keep your API keys secret. Never expose them in client-side code.
            </Text>
            <Button variant="outline" size="sm">Generate New Key</Button>
          </Stack>
        </Section>

        <Section title="Danger Zone" description="Irreversible actions.">
          <Show
            when={showDeleteConfirm()}
            fallback={
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                Delete Account
              </Button>
            }
          >
            <Card padding="md">
              <Stack direction="vertical" gap="md">
                <Text variant="body" weight="semibold">Are you sure?</Text>
                <Text variant="caption" class="text-muted">
                  This will permanently delete your account and all data.
                </Text>
                <Stack direction="horizontal" gap="sm">
                  <Button variant="outline" size="sm">Yes, Delete</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            </Card>
          </Show>
        </Section>
      </Stack>
    </ProtectedRoute>
  );
}
