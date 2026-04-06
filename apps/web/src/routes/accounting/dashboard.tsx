import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { KpiCard } from "../../components/accounting/KpiCard";
import { ClientCard } from "../../components/accounting/ClientCard";
import { formatMoney } from "../../components/accounting/CurrencyInput";
import { useAuth } from "../../stores";
import { trpc } from "../../lib/trpc";
import { useQuery } from "../../lib/use-trpc";

interface QuickAction {
  label: string;
  href: string;
  description: string;
}

const quickActions: QuickAction[] = [
  {
    label: "New Invoice",
    href: "/accounting/invoices/new",
    description: "Create and send an invoice in under a minute.",
  },
  {
    label: "Add Client",
    href: "/accounting/clients",
    description: "Onboard a new client with their portal in one click.",
  },
  {
    label: "Run Report",
    href: "/accounting/reports",
    description: "P&L, Balance Sheet, Cash Flow — generated instantly.",
  },
  {
    label: "Reconcile Account",
    href: "/accounting/expenses",
    description: "Match transactions and clear your books.",
  },
];

interface Deadline {
  title: string;
  due: string;
}

const upcomingDeadlines: Deadline[] = [
  { title: "Q2 Federal Estimated Tax", due: "Jun 17" },
  { title: "Sales Tax Filing — California", due: "Jun 30" },
  { title: "Payroll Tax Deposit", due: "Jul 5" },
];

export default function AccountingDashboard(): JSX.Element {
  const auth = useAuth();

  const kpis = useQuery(() =>
    trpc.accounting.dashboard.getKpis.query().catch(() => ({
      outstandingInvoices: 0,
      revenueMtd: 0,
      expensesMtd: 0,
      profitMargin: 0,
    })),
  );

  const clients = useQuery(() =>
    trpc.accounting.clients.list.query().catch(() => []),
  );

  return (
    <ProtectedRoute>
      <SEOHead
        title="Accounting Dashboard"
        description="Your accounting command center."
        path="/accounting/dashboard"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="caption" class="text-muted">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <Text variant="h1" weight="bold">
            Welcome back,{" "}
            {auth.currentUser()?.displayName?.split(" ")[0] ?? "Partner"}.
          </Text>
          <Text variant="body" class="text-muted">
            Here's how your firm is doing today.
          </Text>
        </Stack>

        {/* KPIs */}
        <div class="stats-grid">
          <KpiCard
            label="Outstanding Invoices"
            value={
              kpis.loading()
                ? "—"
                : formatMoney(kpis.data()?.outstandingInvoices ?? 0)
            }
          />
          <KpiCard
            label="Revenue (MTD)"
            value={
              kpis.loading() ? "—" : formatMoney(kpis.data()?.revenueMtd ?? 0)
            }
          />
          <KpiCard
            label="Expenses (MTD)"
            value={
              kpis.loading() ? "—" : formatMoney(kpis.data()?.expensesMtd ?? 0)
            }
          />
          <KpiCard
            label="Profit Margin"
            value={
              kpis.loading() ? "—" : `${kpis.data()?.profitMargin ?? 0}%`
            }
          />
        </div>

        {/* Quick Actions */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">
            Quick Actions
          </Text>
          <div class="grid-3">
            <For each={quickActions}>
              {(action) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="sm">
                    <Text variant="h4" weight="semibold">
                      {action.label}
                    </Text>
                    <Text variant="body" class="text-muted">
                      {action.description}
                    </Text>
                    <A href={action.href}>
                      <Button variant="outline" size="sm">
                        Open
                      </Button>
                    </A>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* Recent Clients */}
        <Stack direction="vertical" gap="sm">
          <Stack direction="horizontal" justify="between" align="center">
            <Text variant="h3" weight="semibold">
              Recent Clients
            </Text>
            <A href="/accounting/clients">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </A>
          </Stack>
          <Show
            when={(clients.data() ?? []).length > 0}
            fallback={
              <Card padding="md">
                <Stack direction="vertical" gap="sm" align="center">
                  <Text variant="body" class="text-muted">
                    No clients yet. Add your first client to get started.
                  </Text>
                  <A href="/accounting/clients">
                    <Button variant="primary" size="sm">
                      Add Client
                    </Button>
                  </A>
                </Stack>
              </Card>
            }
          >
            <div class="grid-3">
              <For each={(clients.data() ?? []).slice(0, 6)}>
                {(c) => (
                  <ClientCard
                    name={c.name}
                    email={c.email}
                    company={c.company}
                  />
                )}
              </For>
            </div>
          </Show>
        </Stack>

        {/* Deadlines */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">
            Upcoming Deadlines
          </Text>
          <Card padding="md">
            <Stack direction="vertical" gap="sm">
              <For each={upcomingDeadlines}>
                {(d) => (
                  <Stack direction="horizontal" justify="between" align="center">
                    <Text variant="body">{d.title}</Text>
                    <Text variant="caption" class="text-muted">
                      Due {d.due}
                    </Text>
                  </Stack>
                )}
              </For>
            </Stack>
          </Card>
        </Stack>

        {/* Activity */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">
            Recent Activity
          </Text>
          <Card padding="md">
            <Text variant="body" class="text-muted">
              Activity will appear here as your firm uses the platform.
            </Text>
          </Card>
        </Stack>
      </Stack>
    </ProtectedRoute>
  );
}
