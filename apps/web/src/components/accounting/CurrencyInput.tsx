import type { JSX } from "solid-js";
import { Input } from "@back-to-the-future/ui";

interface CurrencyInputProps {
  label?: string;
  name?: string;
  value: number; // minor units (cents)
  onChange: (value: number) => void;
  currency?: string;
  disabled?: boolean;
}

export function formatMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function CurrencyInput(props: CurrencyInputProps): JSX.Element {
  const display = (): string => (props.value / 100).toFixed(2);

  const handleInput = (e: Event): void => {
    const target = e.currentTarget as HTMLInputElement;
    const parsed = Number.parseFloat(target.value);
    if (Number.isNaN(parsed)) {
      props.onChange(0);
      return;
    }
    props.onChange(Math.round(parsed * 100));
  };

  return (
    <Input
      label={props.label}
      name={props.name}
      type="number"
      value={display()}
      onInput={handleInput}
      disabled={props.disabled}
      placeholder="0.00"
    />
  );
}
