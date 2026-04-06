import type { JSX } from "solid-js";
import { For, createSignal, createMemo } from "solid-js";
import {
  Button,
  Card,
  Input,
  Select,
  Stack,
  Text,
  Textarea,
} from "@back-to-the-future/ui";
import { LineItemRow, type LineItemDraft } from "./LineItemRow";
import { formatMoney } from "./CurrencyInput";

export interface ClientOption {
  id: string;
  name: string;
}

export interface InvoiceFormSubmit {
  clientId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  taxRate: number;
  lineItems: LineItemDraft[];
  sendNow: boolean;
}

interface InvoiceFormProps {
  clients: ClientOption[];
  onSubmit: (input: InvoiceFormSubmit) => void;
  submitting?: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function InvoiceForm(props: InvoiceFormProps): JSX.Element {
  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 30);

  const [clientId, setClientId] = createSignal(props.clients[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = createSignal(
    `INV-${Date.now().toString().slice(-6)}`,
  );
  const [issueDate, setIssueDate] = createSignal(isoDate(today));
  const [dueDate, setDueDate] = createSignal(isoDate(due));
  const [notes, setNotes] = createSignal("");
  const [taxRate, setTaxRate] = createSignal(0);
  const [items, setItems] = createSignal<LineItemDraft[]>([
    { description: "", quantity: 1, rate: 0 },
  ]);

  const subtotal = createMemo(() =>
    items().reduce((sum, li) => sum + li.quantity * li.rate, 0),
  );
  const taxAmount = createMemo(() => Math.round((subtotal() * taxRate()) / 100));
  const total = createMemo(() => subtotal() + taxAmount());

  const updateItem = (index: number, item: LineItemDraft): void => {
    setItems(items().map((it, i) => (i === index ? item : it)));
  };

  const removeItem = (index: number): void => {
    if (items().length === 1) return;
    setItems(items().filter((_, i) => i !== index));
  };

  const addItem = (): void => {
    setItems([...items(), { description: "", quantity: 1, rate: 0 }]);
  };

  const handleSubmit = (sendNow: boolean): void => {
    if (!clientId()) return;
    props.onSubmit({
      clientId: clientId(),
      invoiceNumber: invoiceNumber(),
      issueDate: issueDate(),
      dueDate: dueDate(),
      notes: notes(),
      taxRate: taxRate(),
      lineItems: items().filter((li) => li.description.trim().length > 0),
      sendNow,
    });
  };

  return (
    <Card padding="md">
      <Stack direction="vertical" gap="md">
        <Text variant="h3" weight="semibold">
          New Invoice
        </Text>

        <Stack direction="horizontal" gap="md">
          <Select
            label="Client"
            value={clientId()}
            onChange={(v) => setClientId(v)}
            options={props.clients.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Input
            label="Invoice Number"
            value={invoiceNumber()}
            onInput={(e) =>
              setInvoiceNumber((e.currentTarget as HTMLInputElement).value)
            }
          />
        </Stack>

        <Stack direction="horizontal" gap="md">
          <Input
            type="date"
            label="Issue Date"
            value={issueDate()}
            onInput={(e) =>
              setIssueDate((e.currentTarget as HTMLInputElement).value)
            }
          />
          <Input
            type="date"
            label="Due Date"
            value={dueDate()}
            onInput={(e) =>
              setDueDate((e.currentTarget as HTMLInputElement).value)
            }
          />
          <Input
            type="number"
            label="Tax Rate (%)"
            value={String(taxRate())}
            onInput={(e) =>
              setTaxRate(
                Number.parseFloat(
                  (e.currentTarget as HTMLInputElement).value || "0",
                ),
              )
            }
          />
        </Stack>

        <Stack direction="vertical" gap="sm">
          <Text variant="h4" weight="semibold">
            Line Items
          </Text>
          <For each={items()}>
            {(item, index) => (
              <LineItemRow
                index={index()}
                item={item}
                onChange={updateItem}
                onRemove={removeItem}
              />
            )}
          </For>
          <Button variant="outline" size="sm" onClick={addItem} type="button">
            + Add Line Item
          </Button>
        </Stack>

        <Textarea
          label="Notes"
          rows={3}
          value={notes()}
          onInput={(e) =>
            setNotes((e.currentTarget as HTMLTextAreaElement).value)
          }
          placeholder="Payment terms, thank-you note, or anything the client needs to know."
        />

        <Stack direction="horizontal" justify="between" align="center">
          <Stack direction="vertical" gap="xs">
            <Text variant="caption" class="text-muted">
              Subtotal: {formatMoney(subtotal())}
            </Text>
            <Text variant="caption" class="text-muted">
              Tax: {formatMoney(taxAmount())}
            </Text>
            <Text variant="h4" weight="bold">
              Total: {formatMoney(total())}
            </Text>
          </Stack>
          <Stack direction="horizontal" gap="sm">
            <Button
              variant="outline"
              onClick={() => handleSubmit(false)}
              disabled={props.submitting}
              type="button"
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSubmit(true)}
              disabled={props.submitting}
              type="button"
            >
              Send Invoice
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}
