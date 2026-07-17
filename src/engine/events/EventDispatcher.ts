export interface Subscription {
  dispose(): void
}

export type EventListener<TEvent> = (event: TEvent) => void

export interface EventSource<TEvent> {
  subscribe(listener: EventListener<TEvent>): Subscription
}

export interface EventDispatcher<TEvent> extends EventSource<TEvent> {
  publish(event: TEvent): void
}

export class InMemoryEventDispatcher<
  TEvent,
> implements EventDispatcher<TEvent> {
  private readonly listeners = new Set<EventListener<TEvent>>()

  public subscribe(listener: EventListener<TEvent>): Subscription {
    this.listeners.add(listener)

    return {
      dispose: (): void => {
        this.listeners.delete(listener)
      },
    }
  }

  public publish(event: TEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event)
    }
  }
}
