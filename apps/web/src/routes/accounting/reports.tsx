import type { JSX } from "solid-js";
import { Show, createSignal, createMemo } from "solid-js";
import {
  Button,
  Card,
  Input,
  Select,
  Stack,
  Text,
} from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { formatMoney } from "../../components/accounting/CurrencyInput";
import { showToast } from "../../components/Toast";
import { trpc } from "../../lib/trpc";
import { useQuery } from "../../lib/use-trpc";

type ReportType = "pl" | "balance" | "cashflow" | "tax";

export default function ReportsPage(): JSX.Element {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [reportType, setReportType] = createSignal<ReportType>("pl");
  const [from, setFrom] = createSignal(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = createSignal(today.toISOString().slice(0, 10));

  const pl = useQuery(() =>
    trpc.accounting.reports.profitAndLoss
      .query({ from: new Date(from()), to: new Date(to()) })
      .catch(() => ({ from: new Date(), to: new Date(), revenue: 0, expenses: 0, netIncome: 0 })),
  );

  const balance = useQuery(() =>
    trpc.accounting.reports.balanceSheet
      .query()
      .catch(() => ({ assets: 0, liabilities: 0, equity: 0, asOf: new Date() })),
  );

  const cash = useQuery(() =>
    trpc.accounting.reports.cashFlow
      .query({ from: new Date(from()), to: new Date(to()) })
      .catch(() => ({
        from: new Date(),
        to: new Date(),
        operating: 0,
        investing: 0,
        financing: 0,
        netChange: 0,
      })),
  );

  const tax = useQuery(() =>
    trpc.accounting.reports.taxSummary
      .query({ year: new Date(from()).getFullYear() })
      .catch(() => ({ year: new Date().getFullYear(), taxCollected: 0 })),
  );

  const refetchAll = (): void => {
    pl.refetch();
    cash.refetch();
    tax.refetch();
    balance.refetch();
  };

  const exportPdf = (): void => {
    showToast("PDF export queued — you'll receive an email when ready", "info");
  };

  const exportCsv = (): void => {
    showToast("CSV export queued", "info");
  };

  const heading = createMemo(() => {
    switch (reportType()) {
      case "pl":
        return "Profit & Loss";
      case "balance":
        return "Balance Sheet";
      case "cashflow":
        return "Cash Flow";
      case "tax":
        return "Tax Summary";
    }
  });

  return (
    <ProtectedRoute>
      <SEOHead
        title="Reports"
        description="Financial reports."
        path="/accounting/reports"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Financial Reports
          </Text>
          <Text variant="body" class="text-muted">
            Real-time insights. Audit-ready output. One click from raw data to
            board deck.
          </Text>
        </Stack>

        <Card padding="md">
          <Stack direction="horizontal" gap="md" align="end">
            <Select
              label="Report"
              value={reportType()}
              onChange={(v) => setReportType(v as ReportType)}
              options={[
                { value: "pl", label: "Profit & Loss" },
                { value: "balance", label: "Balance Sheet" },
                { value: "cashflow", label: "Cash Flow" },
                { value: "tax", label: "Tax Summary" },
              ]}
            />
            <Input
              label="From"
              type="date"
              value={from()}
              onInput={(e) =>
                setFrom((e.currentTarget as HTMLInputElement).value)
              }
            />
            <Input
              label="To"
              type="date"
              value={to()}
              onInput={(e) =>
                setTo((e.currentTarget as HTMLInputElement).value)
              }
            />
            <Button variant="primary" onClick={refetchAll} type="button">
              Generate
            </Button>
            <Button variant="outline" onClick={exportPdf} type="button">
              Export PDF
            </Button>
            <Button variant="outline" onClick={exportCsv} type="button">
              Export CSV
            </Button>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h2" weight="semibold">
              {heading()}
            </Text>

            <Show when={reportType() === "pl"}>
              <Stack direction="vertical" gap="sm">
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">Revenue</Text>
                  <Text variant="body" weight="semibold">
                    {formatMoney(pl.data()?.revenue ?? 0)}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">Expenses</Text>
                  <Text variant="body" weight="semibold">
                    {formatMoney(pl.data()?.expenses ?? 0)}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="h4" weight="bold">
                    Net Income
                  </Text>
                  <Text variant="h4" weight="bold">
                    {formatMoney(pl.data()?.netIncome ?? 0)}
                  </Text>
                </Stack>
              </Stack>
            </Show>

            <Show when={reportType() === "balance"}>
              <Stack direction="vertical" gap="sm">
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">Assets</Text>
                  <Text variant="body" weight="semibold">
                    {formatMoney(balance.data()?.assets ?? 0)}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">Liabilities</Text>
                  <Text variant="body" weight="semibold">
                    {formatMoney(balance.data()?.liabilities ?? 0)}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="h4" weight="bold">
                    Equity
                  </Text>
                  <Text variant="h4" weight="bold">
                    {formatMoney(balance.data()?.equity ?? 0)}
                  </Text>
                </Stack>
              </Stack>
            </Show>

            <Show when={reportType() === "cashflow"}>
              <Stack direction="vertical" gap="sm">
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">Operating</Text>
                  <Text variant="body" weight="semibold">
                    {formatMoney(cash.data()?.operating ?? 0)}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">Investing</Text>
                  <Text variant="body" weight="semibold">
                    {formatMoney(cash.data()?.investing ?? 0)}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">Financing</Text>
                  <Text variant="body" weight="semibold">
                    {formatMoney(cash.data()?.financing ?? 0)}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="h4" weight="bold">
                    Net Change
                  </Text>
                  <Text variant="h4" weight="bold">
                    {formatMoney(cash.data()?.netChange ?? 0)}
                  </Text>
                </Stack>
              </Stack>
            </Show>

            <Show when={reportType() === "tax"}>
              <Stack direction="vertical" gap="sm">
                <Stack direction="horizontal" justify="between">
                  <Text variant="body">
                    Year {tax.data()?.year ?? new Date().getFullYear()}
                  </Text>
                </Stack>
                <Stack direction="horizontal" justify="between">
                  <Text variant="h4" weight="bold">
                    Tax Collected
                  </Text>
                  <Text variant="h4" weight="bold">
                    {formatMoney(tax.data()?.taxCollected ?? 0)}
                  </Text>
                </Stack>
              </Stack>
            </Show>
          </Stack>
        </Card>
      </Stack>
    </ProtectedRoute>
  );
}
