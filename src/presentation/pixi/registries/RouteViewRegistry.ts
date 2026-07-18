import type { Ticker } from 'pixi.js'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId } from '@/game/domain/Ids'
import type { RouteLayout } from '@/game/layout/RouteLayout'
import type { WorldView } from '../WorldView'
import { RouteView } from '../views/RouteView'

export class RouteViewRegistry {
  private readonly views = new Map<RouteId, RouteView>()

  public constructor(
    private readonly world: WorldView,
    private readonly state: GameStateReader,
    ticker: Ticker
  ) {
    for (const route of state.getRoutes()) {
      const view = new RouteView(route.id, route.color, ticker)

      this.views.set(route.id, view)
      this.world.addRouteView(view)
    }
  }

  public get(routeId: RouteId): RouteView | undefined {
    return this.views.get(routeId)
  }

  public getAll(): readonly RouteView[] {
    return [...this.views.values()]
  }

  public renderAll(layouts: ReadonlyMap<RouteId, RouteLayout>): void {
    const stations = this.state.getStations()

    for (const [routeId, view] of this.views) {
      view.render(
        layouts.get(routeId) ?? null,
        this.state.getRoute(routeId) ?? null,
        stations
      )
    }
  }
}
