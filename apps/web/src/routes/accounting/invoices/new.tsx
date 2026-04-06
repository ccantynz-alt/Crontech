import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { SEOHead } from "../../../components/SEOHead";
import {
  InvoiceForm,
  type InvoiceFormSubmit,
} from "../../../components/accounting/InvoiceForm";
import { showToast } from "../../../components/Toast";
import { trpc } from "../../../lib/trpc";
import { useQuery, useMutation, friendlyError } from "../../../lib/use-trpc";

export default function NewInvoicePage(): JSX.Element {
  const navigate = useNavigate();

  const clients = useQuery(() =>
    trpc.accounting.clients.list.query().catch(() => []),
  );

  const create = useMutation((input: InvoiceFormSubmit) =>
    trpc.accounting.invoices.create.mutate({
      clientId: input.clientId,
      invoiceNumber: input.invoiceNumber,
      issueDate: new Date(input.issueDate),
      dueDate: new Date(input.dueDate),
      notes: input.notes,
      taxRate: input.taxRate,
      lineItems: input.lineItems,
      sendNow: input.sendNow,
    }),
  );

  const handleSubmit = async (input: InvoiceFormSubmit): Promise<void> => {
    try {
      if (input.lineItems.length === 0) {
        showToast("Add at least one line item", "error");
        return;
      }
      await create.mutate(input);
      showToast(
        input.sendNow ? "Invoice sent" : "Draft saved",
        "success",
      );
      navigate("/accounting/invoices");
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  return (
    <ProtectedRoute>
      <SEOHead
        title="New Invoice"
        description="Create a new invoice."
        path="/accounting/invoices/new"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            New Invoice
          </Text>
          <Text variant="body" class="text-muted">
            Build, preview, and send in under a minute.
          </Text>
        </Stack>

        <InvoiceForm
          clients={(clients.data() ?? []).map((c) => ({
            id: c.id,
            name: c.name,
          }))}
          onSubmit={handleSubmit}
          submitting={create.loading()}
        />
      </Stack>
    </ProtectedRoute>
  );
}
