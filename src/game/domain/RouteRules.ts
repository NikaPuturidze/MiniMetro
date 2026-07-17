import type { GameStateReader } from './GameState'
import type { RouteId, StationId } from './Ids'
import type { Route, RouteTerminal } from './Route'

export type GameCommandFailure =
  | 'station-not-found'
  | 'route-not-found'
  | 'same-station'
  | 'station-already-in-route'
  | 'route-slot-unavailable'
  | 'station-capacity-reached'
  | 'invalid-terminal'
  | 'middle-station-removal-not-allowed'
  | 'invalid-segment'

export type RuleResult =
  | { readonly success: true }
  | { readonly success: false; readonly reason: GameCommandFailure }

const allowed: RuleResult = { success: true }

export class RouteRules {
  public static readonly MAX_ROUTES_PER_STATION = 3

  public canStartRoute(
    startStationId: StationId,
    endStationId: StationId,
    state: GameStateReader
  ): RuleResult {
    if (!state.getStation(startStationId) || !state.getStation(endStationId)) {
      return { success: false, reason: 'station-not-found' }
    }

    if (startStationId === endStationId) {
      return { success: false, reason: 'same-station' }
    }

    if (state.getAvailableRoutes().length === 0) {
      return { success: false, reason: 'route-slot-unavailable' }
    }

    return this.canAttachBoth(startStationId, endStationId, state)
  }

  public canExtendRoute(
    routeId: RouteId,
    stationId: StationId,
    terminal: RouteTerminal,
    state: GameStateReader
  ): RuleResult {
    const route = state.getRoute(routeId)

    if (!route) {
      return { success: false, reason: 'route-not-found' }
    }

    if (!state.getStation(stationId)) {
      return { success: false, reason: 'station-not-found' }
    }

    if (!this.hasTerminal(route, terminal)) {
      return { success: false, reason: 'invalid-terminal' }
    }

    if (route.hasStation(stationId)) {
      return { success: false, reason: 'station-already-in-route' }
    }

    return this.canAttachStation(stationId, state)
  }

  public canInsertStation(
    routeId: RouteId,
    stationId: StationId,
    segmentIndex: number,
    state: GameStateReader
  ): RuleResult {
    const route = state.getRoute(routeId)

    if (!route) {
      return { success: false, reason: 'route-not-found' }
    }

    if (!state.getStation(stationId)) {
      return { success: false, reason: 'station-not-found' }
    }

    if (route.hasStation(stationId)) {
      return { success: false, reason: 'station-already-in-route' }
    }

    if (segmentIndex < 0 || segmentIndex >= route.stationCount - 1) {
      return { success: false, reason: 'invalid-segment' }
    }

    return this.canAttachStation(stationId, state)
  }

  public canRemoveTerminal(
    routeId: RouteId,
    terminal: RouteTerminal,
    state: GameStateReader
  ): RuleResult {
    const route = state.getRoute(routeId)

    if (!route) {
      return { success: false, reason: 'route-not-found' }
    }

    return this.hasTerminal(route, terminal)
      ? allowed
      : { success: false, reason: 'invalid-terminal' }
  }

  public canSetSegmentRouting(
    routeId: RouteId,
    segmentIndex: number,
    state: GameStateReader
  ): RuleResult {
    const route = state.getRoute(routeId)

    if (!route) {
      return { success: false, reason: 'route-not-found' }
    }

    return segmentIndex >= 0 && segmentIndex < route.stationCount - 1
      ? allowed
      : { success: false, reason: 'invalid-segment' }
  }

  private canAttachBoth(
    firstId: StationId,
    secondId: StationId,
    state: GameStateReader
  ): RuleResult {
    const first = this.canAttachStation(firstId, state)

    return first.success ? this.canAttachStation(secondId, state) : first
  }

  private canAttachStation(
    stationId: StationId,
    state: GameStateReader
  ): RuleResult {
    return state.getRoutesForStation(stationId).length <
      RouteRules.MAX_ROUTES_PER_STATION
      ? allowed
      : { success: false, reason: 'station-capacity-reached' }
  }

  private hasTerminal(route: Route, terminal: RouteTerminal): boolean {
    return terminal === 'start'
      ? route.getFirstStationId() !== null
      : route.getLastStationId() !== null
  }
}
