import {appEventSchema, type AppEvent} from "@deckflix/shared";

type AppEventType = AppEvent["type"];
type AppEventInput<Type extends AppEventType> = Omit<
  Extract<AppEvent, {type: Type}>,
  "type"
>;
type AppEventListener = (event: AppEvent) => void;

const listeners = new Set<AppEventListener>();

export const subscribeAppEvents = (listener: AppEventListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitEvent = <Type extends AppEventType>(
  type: Type,
  input: AppEventInput<Type>,
) => {
  const event = appEventSchema.parse({type, ...input}) as Extract<
    AppEvent,
    {type: Type}
  >;

  for (const listener of listeners) {
    listener(event);
  }
};

export type {AppEvent};
