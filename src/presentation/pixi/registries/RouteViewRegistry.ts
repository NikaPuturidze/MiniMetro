import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId } from '@/game/domain/Ids'
import type { RouteLayout } from '@/game/layout/RouteLayout'
import type { WorldView } from '../WorldView'
import { RouteView } from '../views/RouteView'

export class RouteViewRegistry {
  private readonly views = new Map<RouteId, RouteView>()

  public constructor(
    private readonly world: WorldView,
    state: GameStateReader
  ) {
    for (const route of state.getRoutes()) {
      const view = new RouteView(route.id, route.color)

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
    for (const [routeId, view] of this.views) {
      view.render(layouts.get(routeId) ?? null)
    }
  }
}
