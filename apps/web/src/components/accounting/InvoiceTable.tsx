import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { StatusBadge, type InvoiceStatus } from "./StatusBadge";
import { formatMoney } from "./CurrencyInput";

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  clientName?: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  total: number;
  currency: string;
}

interface InvoiceTableProps {
  invoices: InvoiceRow[];
  onView?: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onSend?: (id: string) => void;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function InvoiceTable(props: InvoiceTableProps): JSX.Element {
  return (
    <Card padding="md">
      <Show
        when={props.invoices.length > 0}
        fallback={
          <Stack direction="vertical" gap="sm" align="center">
            <Text variant="body" class="text-muted">
              No invoices yet. Create your first invoice to get started.
            </Text>
          </Stack>
        }
      >
        <table class="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Client</th>
              <th>Status</th>
              <th>Issued</th>
              <th>Due</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.invoices}>
              {(inv) => (
                <tr>
                  <td>{inv.invoiceNumber}</td>
                  <td>{inv.clientName ?? "—"}</td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td>{fmtDate(inv.issueDate)}</td>
                  <td>{fmtDate(inv.dueDate)}</td>
                  <td>{formatMoney(inv.total, inv.currency)}</td>
                  <td>
                    <Stack direction="horizontal" gap="xs">
                      <Show when={props.onView}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => props.onView?.(inv.id)}
                          type="button"
                        >
                          View
                        </Button>
                      </Show>
                      <Show when={inv.status === "draft" && props.onSend}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => props.onSend?.(inv.id)}
                          type="button"
                        >
                          Send
                        </Button>
                      </Show>
                      <Show when={inv.status === "sent" && props.onMarkPaid}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => props.onMarkPaid?.(inv.id)}
                          type="button"
                        >
                          Mark Paid
                        </Button>
                      </Show>
                    </Stack>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </Card>
  );
}
