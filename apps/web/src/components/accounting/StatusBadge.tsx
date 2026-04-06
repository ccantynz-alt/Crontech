import type { JSX } from "solid-js";
import { Badge } from "@back-to-the-future/ui";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

interface StatusBadgeProps {
  status: InvoiceStatus;
}

const VARIANT: Record<
  InvoiceStatus,
  "info" | "success" | "warning" | "error" | "default"
> = {
  draft: "default",
  sent: "info",
  paid: "success",
  overdue: "error",
  void: "warning",
};

const LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export function StatusBadge(props: StatusBadgeProps): JSX.Element {
  return (
    <Badge variant={VARIANT[props.status]} size="sm">
      {LABEL[props.status]}
    </Badge>
  );
}
