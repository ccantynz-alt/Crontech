import type { JSX } from "solid-js";
import { createSignal, createMemo } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { Button, Select, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import {
  InvoiceTable,
  type InvoiceRow,
} from "../../components/accounting/InvoiceTable";
import type { InvoiceStatus } from "../../components/accounting/StatusBadge";
import { showToast } from "../../components/Toast";
import { trpc } from "../../lib/trpc";
import { useQuery, useMutation, friendlyError } from "../../lib/use-trpc";

type Filter = "all" | InvoiceStatus;

export default function InvoicesPage(): JSX.Element {
  const [filter, setFilter] = createSignal<Filter>("all");
  const navigate = useNavigate();

  const invoices = useQuery(() => {
    const f = filter();
    return trpc.accounting.invoices.list
      .query(f === "all" ? undefined : { status: f })
      .catch(() => []);
  });

  const clients = useQuery(() =>
    trpc.accounting.clients.list.query().catch(() => []),
  );

  const markPaid = useMutation((input: { id: string }) =>
    trpc.accounting.invoices.markPaid.mutate(input),
  );
  const send = useMutation((input: { id: string }) =>
    trpc.accounting.invoices.send.mutate(input),
  );

  const rows = createMemo<InvoiceRow[]>(() => {
    const list = invoices.data() ?? [];
    const cs = clients.data() ?? [];
    return list.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: cs.find((c) => c.id === inv.clientId)?.name,
      status: inv.status as InvoiceStatus,
      issueDate: new Date(inv.issueDate),
      dueDate: new Date(inv.dueDate),
      total: inv.total,
      currency: inv.currency,
    }));
  });

  const handleMarkPaid = async (id: string): Promise<void> => {
    try {
      await markPaid.mutate({ id });
      showToast("Invoice marked as paid", "success");
      invoices.refetch();
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  const handleSend = async (id: string): Promise<void> => {
    try {
      await send.mutate({ id });
      showToast("Invoice sent to client", "success");
      invoices.refetch();
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  const handleView = (id: string): void => {
    navigate(`/accounting/invoices/new?ref=${id}`);
  };

  return (
    <ProtectedRoute>
      <SEOHead
        title="Invoices"
        description="Manage your invoices."
        path="/accounting/invoices"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="horizontal" justify="between" align="center">
          <Stack direction="vertical" gap="xs">
            <Text variant="h1" weight="bold">
              Invoices
            </Text>
            <Text variant="body" class="text-muted">
              Bill clients. Get paid faster. Track every dollar.
            </Text>
          </Stack>
          <A href="/accounting/invoices/new">
            <Button variant="primary">+ New Invoice</Button>
          </A>
        </Stack>

        <Stack direction="horizontal" gap="md" align="center">
          <Select
            label="Filter"
            value={filter()}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: "all", label: "All Invoices" },
              { value: "draft", label: "Drafts" },
              { value: "sent", label: "Sent" },
              { value: "paid", label: "Paid" },
              { value: "overdue", label: "Overdue" },
              { value: "void", label: "Void" },
            ]}
          />
        </Stack>

        <InvoiceTable
          invoices={rows()}
          onView={handleView}
          onMarkPaid={handleMarkPaid}
          onSend={handleSend}
        />
      </Stack>
    </ProtectedRoute>
  );
}
