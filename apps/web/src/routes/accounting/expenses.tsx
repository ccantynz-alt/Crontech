import type { JSX } from "solid-js";
import { For, Show, createSignal, createMemo } from "solid-js";
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Stack,
  Text,
} from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { CurrencyInput, formatMoney } from "../../components/accounting/CurrencyInput";
import { showToast } from "../../components/Toast";
import { trpc } from "../../lib/trpc";
import { useQuery, useMutation, friendlyError } from "../../lib/use-trpc";

const CATEGORIES = [
  "advertising",
  "software",
  "travel",
  "meals",
  "office",
  "utilities",
  "professional_services",
  "payroll",
  "rent",
  "other",
];

interface ExpenseForm {
  date: string;
  vendor: string;
  category: string;
  amount: number;
  deductible: boolean;
  notes: string;
}

const empty: ExpenseForm = {
  date: new Date().toISOString().slice(0, 10),
  vendor: "",
  category: "software",
  amount: 0,
  deductible: true,
  notes: "",
};

export default function ExpensesPage(): JSX.Element {
  const [showModal, setShowModal] = createSignal(false);
  const [form, setForm] = createSignal<ExpenseForm>(empty);
  const [filter, setFilter] = createSignal<string>("all");

  const expenses = useQuery(() =>
    trpc.accounting.expenses.list.query().catch(() => []),
  );

  const filtered = createMemo(() => {
    const list = expenses.data() ?? [];
    const f = filter();
    if (f === "all") return list;
    return list.filter((e) => e.category === f);
  });

  const monthTotal = createMemo(() => {
    const month = new Date().getMonth();
    return (expenses.data() ?? [])
      .filter((e) => new Date(e.date).getMonth() === month)
      .reduce((sum, e) => sum + e.amount, 0);
  });

  const create = useMutation((input: ExpenseForm) =>
    trpc.accounting.expenses.create.mutate({
      date: new Date(input.date),
      vendor: input.vendor,
      category: input.category,
      amount: input.amount,
      deductible: input.deductible,
      notes: input.notes || undefined,
    }),
  );
  const del = useMutation((input: { id: string }) =>
    trpc.accounting.expenses.delete.mutate(input),
  );

  const handleSubmit = async (): Promise<void> => {
    try {
      if (!form().vendor) {
        showToast("Vendor is required", "error");
        return;
      }
      await create.mutate(form());
      showToast("Expense added", "success");
      setShowModal(false);
      setForm(empty);
      expenses.refetch();
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm("Delete this expense?")) return;
    try {
      await del.mutate({ id });
      showToast("Expense deleted", "success");
      expenses.refetch();
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  return (
    <ProtectedRoute>
      <SEOHead
        title="Expenses"
        description="Track and categorize expenses."
        path="/accounting/expenses"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="horizontal" justify="between" align="center">
          <Stack direction="vertical" gap="xs">
            <Text variant="h1" weight="bold">
              Expenses
            </Text>
            <Text variant="body" class="text-muted">
              Every receipt. Every category. Every deduction.
            </Text>
          </Stack>
          <Button
            variant="primary"
            onClick={() => {
              setForm(empty);
              setShowModal(true);
            }}
            type="button"
          >
            + Add Expense
          </Button>
        </Stack>

        <Card padding="md">
          <Stack direction="vertical" gap="xs">
            <Text variant="caption" class="text-muted">
              This Month
            </Text>
            <Text variant="h2" weight="bold">
              {formatMoney(monthTotal())}
            </Text>
          </Stack>
        </Card>

        <Stack direction="horizontal" gap="md" align="center">
          <Select
            label="Category"
            value={filter()}
            onChange={(v) => setFilter(v)}
            options={[
              { value: "all", label: "All Categories" },
              ...CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
          />
        </Stack>

        <Card padding="md">
          <Show
            when={filtered().length > 0}
            fallback={
              <Stack direction="vertical" gap="sm" align="center">
                <Text variant="body" class="text-muted">
                  No expenses yet.
                </Text>
              </Stack>
            }
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Deductible</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <For each={filtered()}>
                  {(e) => (
                    <tr>
                      <td>{new Date(e.date).toLocaleDateString()}</td>
                      <td>{e.vendor}</td>
                      <td>{e.category}</td>
                      <td>{formatMoney(e.amount, e.currency)}</td>
                      <td>{e.deductible ? "Yes" : "No"}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(e.id)}
                          type="button"
                        >
                          Delete
                        </Button>
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
          title="Add Expense"
        >
          <Stack direction="vertical" gap="md">
            <Input
              label="Date"
              type="date"
              value={form().date}
              onInput={(e) =>
                setForm({
                  ...form(),
                  date: (e.currentTarget as HTMLInputElement).value,
                })
              }
            />
            <Input
              label="Vendor"
              value={form().vendor}
              onInput={(e) =>
                setForm({
                  ...form(),
                  vendor: (e.currentTarget as HTMLInputElement).value,
                })
              }
              required
            />
            <Select
              label="Category"
              value={form().category}
              onChange={(v) => setForm({ ...form(), category: v })}
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
            <CurrencyInput
              label="Amount"
              value={form().amount}
              onChange={(amount) => setForm({ ...form(), amount })}
            />
            <Stack direction="horizontal" gap="sm" align="center">
              <input
                type="checkbox"
                checked={form().deductible}
                onChange={(e) =>
                  setForm({
                    ...form(),
                    deductible: (e.currentTarget as HTMLInputElement).checked,
                  })
                }
              />
              <Text variant="body">Tax deductible</Text>
            </Stack>
            <Stack direction="horizontal" gap="sm" justify="end">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} type="button">
                Add Expense
              </Button>
            </Stack>
          </Stack>
        </Modal>
      </Show>
    </ProtectedRoute>
  );
}
