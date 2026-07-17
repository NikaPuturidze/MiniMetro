import type { EventSource, Subscription } from '@/engine/events/EventDispatcher'
import { GameEventType, type GameDomainEvent } from '@/game/domain/GameEvent'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteLayoutCalculator } from '@/game/layout/RouteLayoutCalculator'
import type { RouteViewRegistry } from '../registries/RouteViewRegistry'

export class RouteViewEventHandler {
  private readonly subscription: Subscription

  public constructor(
    events: EventSource<GameDomainEvent>,
    private readonly state: GameStateReader,
    private readonly layouts: RouteLayoutCalculator,
    private readonly views: RouteViewRegistry
  ) {
    this.subscription = events.subscribe(this.handle)
  }

  public renderInitialState(): void {
    this.views.renderAll(this.layouts.calculateAll(this.state))
  }

  public dispose(): void {
    this.subscription.dispose()
  }

  private readonly handle = (event: GameDomainEvent): void => {
    if (event.type === GameEventType.RouteLayoutInvalidated) {
      this.views.renderAll(
        this.layouts.calculateAll(this.state, event.changedRouteId)
      )
    }
  }
}
