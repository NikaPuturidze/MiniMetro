import type { EventDispatcher } from '@/engine/events/EventDispatcher'
import { GameEventType, type GameDomainEvent } from '@/game/domain/GameEvent'
import { GameState } from '@/game/domain/GameState'
import type { RouteId, StationId } from '@/game/domain/Ids'
import { type Route, type SegmentRoutingPreference } from '@/game/domain/Route'
import { RouteRules } from '@/game/domain/RouteRules'
import { Station } from '@/game/domain/Station'
import { OctilinearRouter } from '@/game/layout/OctilinearRouter'
import type {
  CommandResult,
  CreateStationInput,
  ExtendRouteInput,
  GameCommands,
  InsertStationInput,
  RemoveRouteTerminalInput,
  SetSegmentRoutingInput,
  StartRouteInput,
} from './GameCommands'

export class RouteEditingService implements GameCommands {
  private nextStationId = 1

  public constructor(
    private readonly state: GameState,
    private readonly rules: RouteRules,
    private readonly events: EventDispatcher<GameDomainEvent>
  ) {}

  public createStation(input: CreateStationInput): CommandResult<StationId> {
    const station = new Station(
      this.nextStationId++,
      input.x,
      input.y,
      input.stationType
    )

    this.state.addStation(station)
    this.events.publish({
      type: GameEventType.StationCreated,
      stationId: station.id,
      position: station,
    })

    return { success: true, value: station.id }
  }

  public startRoute(input: StartRouteInput): CommandResult<RouteId> {
    const rule = this.rules.canStartRoute(
      input.startStationId,
      input.endStationId,
      this.state
    )

    if (!rule.success) {
      return rule
    }

    const route = this.state.getAvailableRoutes()[0]

    if (!route) {
      return { success: false, reason: 'route-slot-unavailable' }
    }

    route.appendStation(input.startStationId)
    route.appendStation(input.endStationId)

    this.events.publish({
      type: GameEventType.RouteCreated,
      routeId: route.id,
      startStationId: input.startStationId,
      endStationId: input.endStationId,
    })
    this.invalidateLayout(route.id)

    return { success: true, value: route.id }
  }

  public extendRoute(input: ExtendRouteInput): CommandResult<void> {
    const rule = this.rules.canExtendRoute(
      input.routeId,
      input.stationId,
      input.terminal,
      this.state
    )

    if (!rule.success) {
      return rule
    }

    const route = this.state.requireRoute(input.routeId)

    this.preserveImplicitRoutingPreferences(route)

    if (input.terminal === 'start') {
      route.prependStation(input.stationId)
    } else {
      route.appendStation(input.stationId)
    }

    this.events.publish({
      type: GameEventType.RouteConnectedToStation,
      routeId: route.id,
      stationId: input.stationId,
      terminal: input.terminal,
    })
    this.invalidateLayout(route.id)

    return { success: true, value: undefined }
  }

  public insertStation(input: InsertStationInput): CommandResult<void> {
    const rule = this.rules.canInsertStation(
      input.routeId,
      input.stationId,
      input.segmentIndex,
      this.state
    )

    if (!rule.success) {
      return rule
    }

    const route = this.state.requireRoute(input.routeId)

    this.preserveImplicitRoutingPreferences(route)
    route.insertStation(input.segmentIndex + 1, input.stationId)

    this.events.publish({
      type: GameEventType.StationInsertedIntoRoute,
      routeId: route.id,
      stationId: input.stationId,
      segmentIndex: input.segmentIndex,
    })
    this.invalidateLayout(route.id)

    return { success: true, value: undefined }
  }

  public removeRouteTerminal(
    input: RemoveRouteTerminalInput
  ): CommandResult<void> {
    const rule = this.rules.canRemoveTerminal(
      input.routeId,
      input.terminal,
      this.state
    )

    if (!rule.success) {
      return rule
    }

    const route = this.state.requireRoute(input.routeId)

    this.preserveImplicitRoutingPreferences(route)

    const stationId = route.removeTerminal(input.terminal)

    if (stationId === null) {
      return { success: false, reason: 'invalid-terminal' }
    }

    this.events.publish({
      type: GameEventType.RouteTerminalRemoved,
      routeId: route.id,
      stationId,
      terminal: input.terminal,
    })

    if (route.isEmpty) {
      this.events.publish({
        type: GameEventType.RouteRemoved,
        routeId: route.id,
      })
    }

    this.invalidateLayout(route.id)

    return { success: true, value: undefined }
  }

  public setSegmentRouting(input: SetSegmentRoutingInput): CommandResult<void> {
    const rule = this.rules.canSetSegmentRouting(
      input.routeId,
      input.segmentIndex,
      this.state
    )

    if (!rule.success) {
      return rule
    }

    const route = this.state.requireRoute(input.routeId)

    route.setSegmentRoutingPreference(input.segmentIndex, input.preference)
    this.events.publish({
      type: GameEventType.SegmentRoutingChanged,
      routeId: route.id,
      segmentIndex: input.segmentIndex,
      preference: input.preference,
    })
    this.invalidateLayout(route.id)

    return { success: true, value: undefined }
  }

  public removeRoute(routeId: RouteId): CommandResult<void> {
    const route = this.state.getRoute(routeId)

    if (!route) {
      return { success: false, reason: 'route-not-found' }
    }

    route.clear()
    this.events.publish({
      type: GameEventType.RouteRemoved,
      routeId,
    })
    this.invalidateLayout(routeId)

    return { success: true, value: undefined }
  }

  private preserveImplicitRoutingPreferences(route: Route): void {
    const stations = route
      .getStationIds()
      .map((stationId) => this.state.requireStation(stationId))
    const routedSegments = OctilinearRouter.routeSegments(
      stations,
      stations
        .slice(1)
        .map((_, index) => route.getSegmentRoutingPreference(index))
    )

    for (
      let segmentIndex = 0;
      segmentIndex < routedSegments.length;
      segmentIndex++
    ) {
      if (route.getSegmentRoutingPreference(segmentIndex)) {
        continue
      }

      const start = stations[segmentIndex]
      const end = stations[segmentIndex + 1]
      const bend = routedSegments[segmentIndex]?.[1]

      if (!start || !end || !bend) {
        continue
      }

      const preference = this.inferRoutingPreference(start, end, bend)

      if (preference) {
        route.setRoutingPreferenceBetween(start.id, end.id, preference)
      }
    }
  }

  private inferRoutingPreference(
    start: { readonly x: number; readonly y: number },
    end: { readonly x: number; readonly y: number },
    bend: { readonly x: number; readonly y: number }
  ): SegmentRoutingPreference | null {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const absoluteX = Math.abs(deltaX)
    const absoluteY = Math.abs(deltaY)

    if (
      absoluteX === 0 ||
      absoluteY === 0 ||
      Math.abs(absoluteX - absoluteY) < Number.EPSILON
    ) {
      return null
    }

    const diagonalDistance = Math.min(absoluteX, absoluteY)
    const diagonalFirstBend = {
      x: start.x + Math.sign(deltaX) * diagonalDistance,
      y: start.y + Math.sign(deltaY) * diagonalDistance,
    }

    return Math.hypot(
      bend.x - diagonalFirstBend.x,
      bend.y - diagonalFirstBend.y
    ) < 0.001
      ? 'diagonal-first'
      : 'straight-first'
  }

  private invalidateLayout(routeId: RouteId): void {
    this.events.publish({
      type: GameEventType.RouteLayoutInvalidated,
      changedRouteId: routeId,
    })
  }
}
