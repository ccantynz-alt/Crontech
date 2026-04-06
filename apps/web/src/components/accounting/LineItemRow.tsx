import type { JSX } from "solid-js";
import { Button, Input, Stack } from "@back-to-the-future/ui";
import { CurrencyInput, formatMoney } from "./CurrencyInput";

export interface LineItemDraft {
  description: string;
  quantity: number;
  rate: number; // minor units
}

interface LineItemRowProps {
  index: number;
  item: LineItemDraft;
  onChange: (index: number, item: LineItemDraft) => void;
  onRemove: (index: number) => void;
  currency?: string;
}

export function LineItemRow(props: LineItemRowProps): JSX.Element {
  const amount = (): number => props.item.quantity * props.item.rate;

  return (
    <Stack direction="horizontal" gap="sm" align="center">
      <Input
        placeholder="Description"
        value={props.item.description}
        onInput={(e) =>
          props.onChange(props.index, {
            ...props.item,
            description: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <Input
        type="number"
        placeholder="Qty"
        value={String(props.item.quantity)}
        onInput={(e) =>
          props.onChange(props.index, {
            ...props.item,
            quantity: Math.max(
              1,
              Number.parseInt(
                (e.currentTarget as HTMLInputElement).value || "1",
                10,
              ),
            ),
          })
        }
      />
      <CurrencyInput
        value={props.item.rate}
        onChange={(rate) => props.onChange(props.index, { ...props.item, rate })}
      />
      <span class="line-item-amount">
        {formatMoney(amount(), props.currency ?? "USD")}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => props.onRemove(props.index)}
        type="button"
      >
        Remove
      </Button>
    </Stack>
  );
}
