import type { JSX } from "solid-js";
import { For, splitProps } from "solid-js";

export interface CustodyEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  signature?: string;
  hash?: string;
}

export interface ChainOfCustodyProps {
  entries: CustodyEntry[];
  class?: string;
}

export function ChainOfCustody(props: ChainOfCustodyProps): JSX.Element {
  const [local, rest] = splitProps(props, ["entries", "class"]);

  return (
    <div
      class={`chain-of-custody ${local.class ?? ""}`}
      role="table"
      aria-label="Chain of custody log"
      {...rest}
    >
      {/* Header Row */}
      <div class="chain-of-custody-header" role="row">
        <span class="chain-of-custody-cell" role="columnheader">
          Timestamp
        </span>
        <span class="chain-of-custody-cell" role="columnheader">
          Action
        </span>
        <span class="chain-of-custody-cell" role="columnheader">
          Actor
        </span>
        <span class="chain-of-custody-cell" role="columnheader">
          Verification
        </span>
      </div>

      {/* Entry Rows */}
      <For each={local.entries}>
        {(entry) => {
          const hasSignature = (): boolean => Boolean(entry.signature);
          const hasHash = (): boolean => Boolean(entry.hash);
          const isVerified = (): boolean => hasSignature() && hasHash();

          return (
            <div class="chain-of-custody-row" role="row">
              <span class="chain-of-custody-cell" role="cell">
                <time datetime={entry.timestamp}>{entry.timestamp}</time>
              </span>
              <span class="chain-of-custody-cell" role="cell">
                {entry.action}
              </span>
              <span class="chain-of-custody-cell" role="cell">
                {entry.actor}
              </span>
              <span class="chain-of-custody-cell" role="cell">
                <span
                  class={`chain-of-custody-status ${isVerified() ? "chain-of-custody-verified" : "chain-of-custody-unverified"}`}
                >
                  {isVerified() ? "Verified" : "Pending"}
                </span>
                {hasHash() && (
                  <span class="chain-of-custody-hash" title={entry.hash}>
                    {entry.hash!.substring(0, 12)}...
                  </span>
                )}
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
}
