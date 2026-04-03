import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import type { SelectRootItemComponentProps } from "@kobalte/core/select";
import { Select as KobalteSelect } from "@kobalte/core/select";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  name?: string;
  class?: string;
  onChange?: (value: string) => void;
}

export function Select(props: SelectProps): JSX.Element {
  const [local] = splitProps(props, [
    "options",
    "value",
    "placeholder",
    "label",
    "error",
    "disabled",
    "name",
    "class",
    "onChange",
  ]);

  const selectedOption = (): SelectOption | null =>
    local.options.find((o) => o.value === local.value) ?? null;

  return (
    <KobalteSelect<SelectOption>
      multiple={false}
      options={local.options}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      value={selectedOption()}
      placeholder={local.placeholder ?? "Select..."}
      disabled={local.disabled === true}
      name={local.name ?? ""}
      onChange={(option) => {
        if (option) local.onChange?.(option.value);
      }}
      disallowEmptySelection={false}
      itemComponent={(itemProps: SelectRootItemComponentProps<SelectOption>) => (
        <KobalteSelect.Item item={itemProps.item} class="select-item">
          <KobalteSelect.ItemLabel>{itemProps.item.rawValue.label}</KobalteSelect.ItemLabel>
        </KobalteSelect.Item>
      )}
    >
      <div class="select-wrapper">
        <Show when={local.label}>
          <KobalteSelect.Label class="select-label">{local.label}</KobalteSelect.Label>
        </Show>
        <KobalteSelect.Trigger
          class={`select ${local.error ? "select-error" : ""} ${local.class ?? ""}`}
          aria-invalid={!!local.error}
          aria-describedby={local.error ? `${local.name}-error` : undefined}
        >
          <KobalteSelect.Value<SelectOption>>
            {(state) => state.selectedOption().label}
          </KobalteSelect.Value>
        </KobalteSelect.Trigger>
        <Show when={local.error}>
          <span class="select-error-text" id={`${local.name}-error`}>
            {local.error}
          </span>
        </Show>
      </div>
      <KobalteSelect.Portal>
        <KobalteSelect.Content class="select-content">
          <KobalteSelect.Listbox class="select-listbox" />
        </KobalteSelect.Content>
      </KobalteSelect.Portal>
    </KobalteSelect>
  );
}
