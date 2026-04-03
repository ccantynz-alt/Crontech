import type { JSX } from "solid-js";
import { For, splitProps } from "solid-js";

export type TimelineEventType = "event" | "filing" | "hearing" | "deadline";

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description?: string;
  type?: TimelineEventType;
}

export interface TimelineProps {
  events: TimelineEvent[];
  class?: string;
}

const typeColorMap: Record<TimelineEventType, string> = {
  event: "timeline-marker-event",
  filing: "timeline-marker-filing",
  hearing: "timeline-marker-hearing",
  deadline: "timeline-marker-deadline",
};

const typeLabelMap: Record<TimelineEventType, string> = {
  event: "Event",
  filing: "Filing",
  hearing: "Hearing",
  deadline: "Deadline",
};

export function Timeline(props: TimelineProps): JSX.Element {
  const [local, rest] = splitProps(props, ["events", "class"]);

  return (
    <div
      class={`timeline ${local.class ?? ""}`}
      role="list"
      aria-label="Case chronology timeline"
      {...rest}
    >
      <For each={local.events}>
        {(event) => {
          const eventType = (): TimelineEventType => event.type ?? "event";

          return (
            <div class="timeline-item" role="listitem">
              <div class="timeline-line-container">
                <div
                  class={`timeline-marker ${typeColorMap[eventType()]}`}
                  aria-hidden="true"
                />
                <div class="timeline-line" aria-hidden="true" />
              </div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <time class="timeline-date" datetime={event.date}>
                    {event.date}
                  </time>
                  <span class={`timeline-type-badge ${typeColorMap[eventType()]}`}>
                    {typeLabelMap[eventType()]}
                  </span>
                </div>
                <div class="timeline-title">{event.title}</div>
                {event.description && (
                  <div class="timeline-description">{event.description}</div>
                )}
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
