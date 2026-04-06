import type { JSX } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import {
  Button,
  Card,
  Input,
  Modal,
  Stack,
  Text,
} from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { showToast } from "../../components/Toast";
import { trpc } from "../../lib/trpc";
import { useQuery, useMutation, friendlyError } from "../../lib/use-trpc";

interface ClientForm {
  name: string;
  email: string;
  company: string;
  taxId: string;
  contactPerson: string;
}

const empty: ClientForm = {
  name: "",
  email: "",
  company: "",
  taxId: "",
  contactPerson: "",
};

export default function ClientsPage(): JSX.Element {
  const [showModal, setShowModal] = createSignal(false);
  const [form, setForm] = createSignal<ClientForm>(empty);
  const [editingId, setEditingId] = createSignal<string | null>(null);

  const clients = useQuery(() =>
    trpc.accounting.clients.list.query().catch(() => []),
  );

  const createMutation = useMutation((input: ClientForm) =>
    trpc.accounting.clients.create.mutate(input),
  );
  const updateMutation = useMutation(
    (input: { id: string } & Partial<ClientForm>) =>
      trpc.accounting.clients.update.mutate(input),
  );
  const deleteMutation = useMutation((input: { id: string }) =>
    trpc.accounting.clients.delete.mutate(input),
  );

  const openCreate = (): void => {
    setEditingId(null);
    setForm(empty);
    setShowModal(true);
  };

  const openEdit = (client: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    taxId: string | null;
    contactPerson: string | null;
  }): void => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email,
      company: client.company ?? "",
      taxId: client.taxId ?? "",
      contactPerson: client.contactPerson ?? "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      const f = form();
      if (!f.name || !f.email) {
        showToast("Name and email are required", "error");
        return;
      }
      const id = editingId();
      if (id) {
        await updateMutation.mutate({ id, ...f });
        showToast("Client updated", "success");
      } else {
        await createMutation.mutate(f);
        showToast("Client added", "success");
      }
      setShowModal(false);
      clients.refetch();
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm("Delete this client? This cannot be undone.")) return;
    try {
      await deleteMutation.mutate({ id });
      showToast("Client deleted", "success");
      clients.refetch();
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  return (
    <ProtectedRoute>
      <SEOHead
        title="Clients"
        description="Manage your accounting clients."
        path="/accounting/clients"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="horizontal" justify="between" align="center">
          <Stack direction="vertical" gap="xs">
            <Text variant="h1" weight="bold">
              Clients
            </Text>
            <Text variant="body" class="text-muted">
              Every relationship in one place.
            </Text>
          </Stack>
          <Button variant="primary" onClick={openCreate} type="button">
            + Add Client
          </Button>
        </Stack>

        <Card padding="md">
          <Show
            when={(clients.data() ?? []).length > 0}
            fallback={
              <Stack direction="vertical" gap="sm" align="center">
                <Text variant="body" class="text-muted">
                  No clients yet. Add your first client to begin.
                </Text>
                <Button variant="primary" onClick={openCreate} type="button">
                  Add Client
                </Button>
              </Stack>
            }
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Tax ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <For each={clients.data() ?? []}>
                  {(c) => (
                    <tr>
                      <td>{c.name}</td>
                      <td>{c.email}</td>
                      <td>{c.company ?? "—"}</td>
                      <td>{c.taxId ?? "—"}</td>
                      <td>
                        <Stack direction="horizontal" gap="xs">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(c)}
                            type="button"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(c.id)}
                            type="button"
                          >
                            Delete
                          </Button>
                        </Stack>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </Card>
      </Stack>

      <Show when={showModal()}>
        <Modal
          open={true}
          onClose={() => setShowModal(false)}
          title={editingId() ? "Edit Client" : "Add Client"}
        >
          <Stack direction="vertical" gap="md">
            <Input
              label="Name"
              value={form().name}
              onInput={(e) =>
                setForm({
                  ...form(),
                  name: (e.currentTarget as HTMLInputElement).value,
                })
              }
              required
            />
            <Input
              label="Email"
              type="email"
              value={form().email}
              onInput={(e) =>
                setForm({
                  ...form(),
                  email: (e.currentTarget as HTMLInputElement).value,
                })
              }
              required
            />
            <Input
              label="Company"
              value={form().company}
              onInput={(e) =>
                setForm({
                  ...form(),
                  company: (e.currentTarget as HTMLInputElement).value,
                })
              }
            />
            <Input
              label="Tax ID"
              value={form().taxId}
              onInput={(e) =>
                setForm({
                  ...form(),
                  taxId: (e.currentTarget as HTMLInputElement).value,
                })
              }
            />
            <Input
              label="Contact Person"
              value={form().contactPerson}
              onInput={(e) =>
                setForm({
                  ...form(),
                  contactPerson: (e.currentTarget as HTMLInputElement).value,
                })
              }
            />
            <Stack direction="horizontal" gap="sm" justify="end">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} type="button">
                {editingId() ? "Save Changes" : "Add Client"}
              </Button>
            </Stack>
          </Stack>
        </Modal>
      </Show>
    </ProtectedRoute>
  );
}
