import type { GameStateReader } from './GameState'
import type { RouteId, StationId } from './Ids'
import type { Route, RouteTerminal, SegmentRoutingPreference } from './Route'
import type {
  RouteGeometryCandidate,
  RouteGeometryPolicy,
  RouteRoutingChoice,
} from './RouteGeometryPolicy'

export type GameCommandFailure =
  | 'station-not-found'
  | 'route-not-found'
  | 'same-station'
  | 'station-already-in-route'
  | 'route-slot-unavailable'
  | 'station-capacity-reached'
  | 'invalid-terminal'
  | 'route-already-circular'
  | 'route-not-circular'
  | 'route-too-short-to-close'
  | 'middle-station-removal-not-allowed'
  | 'invalid-segment'
  | 'parallel-route-limit-reached'

export type RuleResult =
  | {
      readonly success: true
      readonly routingChoices: readonly RouteRoutingChoice[]
    }
  | { readonly success: false; readonly reason: GameCommandFailure }

const allowed: RuleResult = { success: true, routingChoices: [] }

export class RouteRules {
  public static readonly MAX_ROUTES_PER_STATION = 6

  public constructor(
    private readonly geometryPolicy: RouteGeometryPolicy | null = null
  ) {}

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

    const attachment = this.canAttachBoth(startStationId, endStationId, state)

    if (!attachment.success) {
      return attachment
    }

    const route = state.getAvailableRoutes()[0]

    return route
      ? this.applyGeometryPolicy(
          {
            routeId: route.id,
            stationIds: [startStationId, endStationId],
            isCircular: false,
            preferences: [undefined],
            flexibleSegmentIndices: [0],
          },
          state
        )
      : { success: false, reason: 'route-slot-unavailable' }
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

    if (route.isCircular) {
      return { success: false, reason: 'route-already-circular' }
    }

    if (!this.hasTerminal(route, terminal)) {
      return { success: false, reason: 'invalid-terminal' }
    }

    if (route.hasStation(stationId)) {
      return { success: false, reason: 'station-already-in-route' }
    }

    const attachment = this.canAttachStation(stationId, state)

    if (!attachment.success) {
      return attachment
    }

    const stationIds =
      terminal === 'start'
        ? [stationId, ...route.getStationIds()]
        : [...route.getStationIds(), stationId]
    const flexibleSegmentIndex =
      terminal === 'start' ? 0 : stationIds.length - 2

    return this.applyGeometryPolicy(
      this.createGeometryCandidate(route, stationIds, false, [
        flexibleSegmentIndex,
      ]),
      state
    )
  }

  public canCloseRoute(
    routeId: RouteId,
    terminal: RouteTerminal,
    state: GameStateReader
  ): RuleResult {
    const route = state.getRoute(routeId)

    if (!route) {
      return { success: false, reason: 'route-not-found' }
    }

    if (route.isCircular) {
      return { success: false, reason: 'route-already-circular' }
    }

    if (!this.hasTerminal(route, terminal)) {
      return { success: false, reason: 'invalid-terminal' }
    }

    if (route.stationCount < 3) {
      return { success: false, reason: 'route-too-short-to-close' }
    }

    return this.applyGeometryPolicy(
      this.createGeometryCandidate(route, route.getStationIds(), true, [
        route.stationCount - 1,
      ]),
      state
    )
  }

  public canReopenRoute(routeId: RouteId, state: GameStateReader): RuleResult {
    const route = state.getRoute(routeId)

    if (!route) {
      return { success: false, reason: 'route-not-found' }
    }

    return route.isCircular
      ? allowed
      : { success: false, reason: 'route-not-circular' }
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

    if (segmentIndex < 0 || segmentIndex >= route.segmentCount) {
      return { success: false, reason: 'invalid-segment' }
    }

    const attachment = this.canAttachStation(stationId, state)

    if (!attachment.success) {
      return attachment
    }

    const stationIds = [...route.getStationIds()]

    stationIds.splice(segmentIndex + 1, 0, stationId)

    return this.applyGeometryPolicy(
      this.createGeometryCandidate(route, stationIds, route.isCircular, [
        segmentIndex,
        segmentIndex + 1,
      ]),
      state
    )
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

    if (route.isCircular) {
      return { success: false, reason: 'route-already-circular' }
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

    if (segmentIndex < 0 || segmentIndex >= route.segmentCount) {
      return { success: false, reason: 'invalid-segment' }
    }

    return allowed
  }

  public canUseSegmentRouting(
    routeId: RouteId,
    segmentIndex: number,
    preference: SegmentRoutingPreference,
    state: GameStateReader
  ): RuleResult {
    const route = state.getRoute(routeId)
    const segmentRule = this.canSetSegmentRouting(routeId, segmentIndex, state)

    if (!route || !segmentRule.success) {
      return segmentRule
    }

    const candidate = this.createGeometryCandidate(
      route,
      route.getStationIds(),
      route.isCircular,
      []
    )
    const preferences = [...candidate.preferences]

    preferences[segmentIndex] = preference

    return this.applyGeometryPolicy(
      {
        ...candidate,
        preferences,
      },
      state
    )
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

  private createGeometryCandidate(
    route: Route,
    stationIds: readonly StationId[],
    isCircular: boolean,
    flexibleSegmentIndices: readonly number[]
  ): RouteGeometryCandidate {
    const segmentCount =
      stationIds.length < 2
        ? 0
        : isCircular
          ? stationIds.length
          : stationIds.length - 1
    const preferences = Array.from({ length: segmentCount }, (_, index) => {
      const startId = stationIds[index]
      const endId =
        index === stationIds.length - 1 && isCircular
          ? stationIds[0]
          : stationIds[index + 1]

      return startId === undefined || endId === undefined
        ? undefined
        : route.getRoutingPreferenceBetween(startId, endId)
    })

    return {
      routeId: route.id,
      stationIds,
      isCircular,
      preferences,
      flexibleSegmentIndices,
    }
  }

  private applyGeometryPolicy(
    candidate: RouteGeometryCandidate,
    state: GameStateReader
  ): RuleResult {
    if (!this.geometryPolicy) {
      return allowed
    }

    const routingChoices = this.geometryPolicy.plan(candidate, state)

    return routingChoices === null
      ? { success: false, reason: 'parallel-route-limit-reached' }
      : { success: true, routingChoices }
  }
}
