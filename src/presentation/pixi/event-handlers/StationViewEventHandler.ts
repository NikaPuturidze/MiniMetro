import type { Subscription } from '@/engine/events/EventDispatcher'
import { GameEventType, type GameDomainEvent } from '@/game/domain/GameEvent'
import type { EventSource } from '@/engine/events/EventDispatcher'
import type { StationViewRegistry } from '../registries/StationViewRegistry'

export class StationViewEventHandler {
  private readonly subscription: Subscription

  public constructor(
    events: EventSource<GameDomainEvent>,
    private readonly views: StationViewRegistry
  ) {
    this.subscription = events.subscribe(this.handle)
  }

  public dispose(): void {
    this.subscription.dispose()
  }

  private readonly handle = (event: GameDomainEvent): void => {
    if (event.type === GameEventType.StationCreated) {
      this.views.create(event.stationId)
    }
  }
}
