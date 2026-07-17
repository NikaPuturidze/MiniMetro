import type { RouteId, StationId } from './Ids'
import type { Route } from './Route'
import type { Station } from './Station'

export interface GameStateReader {
  getStation(id: StationId): Station | undefined
  getRoute(id: RouteId): Route | undefined
  getStations(): readonly Station[]
  getRoutes(): readonly Route[]
  getRoutesForStation(id: StationId): readonly Route[]
  getAvailableRoutes(): readonly Route[]
}

export class GameState implements GameStateReader {
  private readonly stations = new Map<StationId, Station>()
  private readonly routes = new Map<RouteId, Route>()

  public addStation(station: Station): void {
    if (this.stations.has(station.id)) {
      throw new Error(`Station ${station.id} already exists.`)
    }

    this.stations.set(station.id, station)
  }

  public addRoute(route: Route): void {
    if (this.routes.has(route.id)) {
      throw new Error(`Route ${route.id} already exists.`)
    }

    this.routes.set(route.id, route)
  }

  public getStation(id: StationId): Station | undefined {
    return this.stations.get(id)
  }

  public requireStation(id: StationId): Station {
    const station = this.getStation(id)

    if (!station) {
      throw new Error(`Station ${id} does not exist.`)
    }

    return station
  }

  public getRoute(id: RouteId): Route | undefined {
    return this.routes.get(id)
  }

  public requireRoute(id: RouteId): Route {
    const route = this.getRoute(id)

    if (!route) {
      throw new Error(`Route ${id} does not exist.`)
    }

    return route
  }

  public getStations(): readonly Station[] {
    return [...this.stations.values()]
  }

  public getRoutes(): readonly Route[] {
    return [...this.routes.values()]
  }

  public getRoutesForStation(id: StationId): readonly Route[] {
    return this.getRoutes().filter((route) => route.hasStation(id))
  }

  public getAvailableRoutes(): readonly Route[] {
    return this.getRoutes().filter((route) => route.isEmpty)
  }
}
