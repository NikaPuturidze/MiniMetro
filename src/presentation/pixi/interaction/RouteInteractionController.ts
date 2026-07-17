import type { Point } from '@/engine/geometry/Point'
import type { GameCommands } from '@/game/application/GameCommands'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type {
  Route,
  RouteTerminal,
  SegmentRoutingPreference,
} from '@/game/domain/Route'
import type { RoutePreviewController } from '../preview/RoutePreviewController'
import type { RouteViewRegistry } from '../registries/RouteViewRegistry'
import type { PointerDownTarget } from './PixiRouteHitTester'
import {
  idleInteraction,
  type RouteInteractionState,
} from './RouteInteractionState'

export interface PointerDownInput {
  readonly button: number
  readonly point: Point
  readonly target: PointerDownTarget
}

export interface PointerMoveInput {
  readonly point: Point
  readonly stationId: StationId | null
}

export interface PointerUpInput {
  readonly stationId: StationId | null
}

type TerminalEditResult =
  | { readonly success: false }
  | {
      readonly success: true
      readonly routeId: RouteId
      readonly action: 'connected' | 'removed'
    }

export class RouteInteractionController {
  private state: RouteInteractionState = idleInteraction

  public constructor(
    private readonly gameState: GameStateReader,
    private readonly commands: GameCommands,
    private readonly routeViews: RouteViewRegistry,
    private readonly preview: RoutePreviewController
  ) {}

  public pointerDown(input: PointerDownInput): void {
    if (input.button !== 0 || this.state.kind !== 'idle') {
      return
    }

    switch (input.target.kind) {
      case 'terminal': {
        const view = this.routeViews.get(input.target.routeId)

        view?.hideTerminalAt(input.target.stationId)
        this.beginRouteDrag(input.target.stationId, input.target.routeId)
        break
      }

      case 'station':
        if (this.gameState.getAvailableRoutes().length > 0) {
          this.beginRouteDrag(input.target.stationId, null)
        }
        break

      case 'route':
        this.beginSegmentDrag(
          input.target.routeId,
          input.target.segmentIndex,
          input.point
        )
        break

      case 'world':
        break
    }
  }

  public pointerMove(input: PointerMoveInput): void {
    if (this.state.kind === 'segment-drag') {
      this.moveSegmentDrag(input)
      return
    }

    if (this.state.kind !== 'route-drag') {
      return
    }

    let drag = this.state

    if (
      drag.routeId !== null &&
      input.stationId === drag.startStationId &&
      input.stationId !== drag.lastJoinedStationId
    ) {
      this.removeHoveredTerminal(drag)

      if (this.state.kind !== 'route-drag') {
        return
      }

      drag = this.state
    }

    if (input.stationId !== drag.lastRetractedStationId) {
      drag = { ...drag, lastRetractedStationId: null }
    }

    if (input.stationId !== drag.lastJoinedStationId) {
      drag = { ...drag, lastJoinedStationId: null }
    }

    this.state = drag

    if (
      input.stationId !== null &&
      input.stationId !== drag.startStationId &&
      input.stationId !== drag.lastRetractedStationId
    ) {
      this.joinHoveredStation(input.stationId)
    }

    if (this.state.kind !== 'route-drag') {
      return
    }

    this.preview.showExtension(
      this.state.startStationId,
      input.point,
      this.getPreviewColor()
    )
  }

  public pointerUp(input: PointerUpInput): void {
    if (this.state.kind === 'segment-drag') {
      this.completeSegmentDrag(input.stationId)
      return
    }

    if (this.state.kind !== 'route-drag') {
      return
    }

    const drag = this.state

    if (input.stationId === null) {
      this.cancel()
      return
    }

    if (input.stationId === drag.lastJoinedStationId) {
      this.showAllTerminals(drag.routeId)
      this.clear()
      return
    }

    if (input.stationId === drag.lastRetractedStationId) {
      const route =
        drag.routeId === null
          ? undefined
          : this.gameState.getRoute(drag.routeId)

      if (route?.stationCount === 1) {
        this.commands.removeRoute(route.id)
      } else {
        this.showAllTerminals(drag.routeId)
      }

      this.clear()
      return
    }

    if (drag.routeId === null && input.stationId === drag.startStationId) {
      this.cancel()
      return
    }

    if (drag.routeId !== null) {
      this.showAllTerminals(drag.routeId)
      this.editTerminal(drag.routeId, drag.startStationId, input.stationId)
    } else {
      this.commands.startRoute({
        startStationId: drag.startStationId,
        endStationId: input.stationId,
      })
    }

    this.clear()
  }

  public cancel(): void {
    if (this.state.kind === 'segment-drag') {
      this.routeViews.get(this.state.routeId)?.showAllSegments()
      this.clear()
      return
    }

    if (this.state.kind === 'route-drag' && this.state.routeId !== null) {
      const route = this.gameState.getRoute(this.state.routeId)

      if (route?.stationCount === 1) {
        this.commands.removeRoute(route.id)
      } else {
        this.showAllTerminals(this.state.routeId)
      }
    }

    this.clear()
  }

  private beginRouteDrag(
    startStationId: StationId,
    routeId: RouteId | null
  ): void {
    this.state = {
      kind: 'route-drag',
      startStationId,
      routeId,
      lastRetractedStationId: null,
      lastJoinedStationId: null,
    }
  }

  private beginSegmentDrag(
    routeId: RouteId,
    segmentIndex: number | null,
    point: Point
  ): void {
    const routeView = this.routeViews.get(routeId)

    if (segmentIndex === null) {
      return
    }

    const routingPreference = this.getSegmentRoutingPreference(
      routeId,
      segmentIndex,
      point
    )

    this.state = {
      kind: 'segment-drag',
      routeId,
      segmentIndex,
      routingPreference,
    }
    routeView?.hideSegment(segmentIndex)
    this.preview.showInsertion(routeId, segmentIndex, point)
  }

  private moveSegmentDrag(input: PointerMoveInput): void {
    if (this.state.kind !== 'segment-drag') {
      return
    }

    const insertionPoint =
      input.stationId === null
        ? input.point
        : (this.gameState.getStation(input.stationId) ?? input.point)
    const routingPreference =
      input.stationId === null
        ? this.getSegmentRoutingPreference(
            this.state.routeId,
            this.state.segmentIndex,
            input.point
          )
        : null

    this.state = {
      ...this.state,
      routingPreference,
    }
    this.preview.showInsertion(
      this.state.routeId,
      this.state.segmentIndex,
      insertionPoint
    )
  }

  private completeSegmentDrag(stationId: StationId | null): void {
    if (this.state.kind !== 'segment-drag') {
      return
    }

    const drag = this.state

    this.routeViews.get(drag.routeId)?.showAllSegments()
    this.clear()

    if (stationId !== null) {
      this.commands.insertStation({
        routeId: drag.routeId,
        segmentIndex: drag.segmentIndex,
        stationId,
      })
    } else if (drag.routingPreference !== null) {
      this.commands.setSegmentRouting({
        routeId: drag.routeId,
        segmentIndex: drag.segmentIndex,
        preference: drag.routingPreference,
      })
    }
  }

  private joinHoveredStation(targetStationId: StationId): void {
    if (this.state.kind !== 'route-drag') {
      return
    }

    const drag = this.state

    this.showAllTerminals(drag.routeId)

    const result =
      drag.routeId === null
        ? this.startRoute(drag.startStationId, targetStationId)
        : this.editTerminal(drag.routeId, drag.startStationId, targetStationId)

    if (!result.success) {
      if (drag.routeId !== null) {
        this.routeViews.get(drag.routeId)?.hideTerminalAt(drag.startStationId)
      }

      return
    }

    const route = this.gameState.getRoute(result.routeId)

    if (!route || route.isEmpty) {
      this.clear()
      return
    }

    this.routeViews.get(result.routeId)?.hideTerminalAt(targetStationId)
    this.state = {
      kind: 'route-drag',
      startStationId: targetStationId,
      routeId: result.routeId,
      lastJoinedStationId: targetStationId,
      lastRetractedStationId:
        result.action === 'removed' ? drag.startStationId : null,
    }
  }

  private removeHoveredTerminal(
    drag: Extract<RouteInteractionState, { readonly kind: 'route-drag' }>
  ): void {
    if (drag.routeId === null) {
      return
    }

    const route = this.gameState.getRoute(drag.routeId)
    const terminal = route
      ? this.getTerminalAt(route, drag.startStationId)
      : null

    if (!route || terminal === null) {
      this.clear()
      return
    }

    const removingStart = terminal === 'start'

    this.showAllTerminals(route.id)

    const result = this.commands.removeRouteTerminal({
      routeId: route.id,
      terminal,
    })
    const updatedRoute = this.gameState.getRoute(route.id)

    if (!result.success || !updatedRoute || updatedRoute.isEmpty) {
      this.clear()
      return
    }

    const nextTerminalId = removingStart
      ? updatedRoute.getFirstStationId()
      : updatedRoute.getLastStationId()

    if (nextTerminalId === null) {
      this.clear()
      return
    }

    this.routeViews.get(route.id)?.hideTerminalAt(nextTerminalId)
    this.state = {
      kind: 'route-drag',
      startStationId: nextTerminalId,
      routeId: route.id,
      lastRetractedStationId: drag.startStationId,
      lastJoinedStationId: null,
    }
  }

  private startRoute(
    startStationId: StationId,
    endStationId: StationId
  ): TerminalEditResult {
    const result = this.commands.startRoute({
      startStationId,
      endStationId,
    })

    return result.success
      ? { success: true, routeId: result.value, action: 'connected' }
      : { success: false }
  }

  private editTerminal(
    routeId: RouteId,
    fromStationId: StationId,
    targetStationId: StationId
  ): TerminalEditResult {
    const route = this.gameState.getRoute(routeId)
    const terminal = route ? this.getTerminalAt(route, fromStationId) : null

    if (!route || terminal === null) {
      return { success: false }
    }

    const stationIds = route.getStationIds()
    const adjacentStationId =
      terminal === 'start' ? stationIds[1] : stationIds.at(-2)
    const shouldRemove =
      targetStationId === fromStationId || targetStationId === adjacentStationId

    if (shouldRemove) {
      const result = this.commands.removeRouteTerminal({
        routeId,
        terminal,
      })

      return result.success
        ? { success: true, routeId, action: 'removed' }
        : { success: false }
    }

    if (route.hasStation(targetStationId)) {
      return { success: false }
    }

    const result = this.commands.extendRoute({
      routeId,
      stationId: targetStationId,
      terminal,
    })

    return result.success
      ? { success: true, routeId, action: 'connected' }
      : { success: false }
  }

  private getTerminalAt(
    route: Route,
    stationId: StationId
  ): RouteTerminal | null {
    if (route.getFirstStationId() === stationId) {
      return 'start'
    }

    return route.getLastStationId() === stationId ? 'end' : null
  }

  private showAllTerminals(routeId: RouteId | null): void {
    if (routeId !== null) {
      this.routeViews.get(routeId)?.showAllTerminals()
    }
  }

  private getPreviewColor(): number {
    if (this.state.kind !== 'route-drag') {
      return 0x777777
    }

    const route =
      this.state.routeId === null
        ? this.gameState.getAvailableRoutes()[0]
        : this.gameState.getRoute(this.state.routeId)

    return route?.color ?? 0x777777
  }

  private getSegmentRoutingPreference(
    routeId: RouteId,
    segmentIndex: number,
    pointer: Point
  ): SegmentRoutingPreference | null {
    const route = this.gameState.getRoute(routeId)
    const stationIds = route?.getStationIds() ?? []
    const startId = stationIds[segmentIndex]
    const endId = stationIds[segmentIndex + 1]
    const start =
      startId === undefined ? undefined : this.gameState.getStation(startId)
    const end =
      endId === undefined ? undefined : this.gameState.getStation(endId)

    if (!start || !end) {
      return null
    }

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

    const directionX = Math.sign(deltaX)
    const directionY = Math.sign(deltaY)
    const diagonalDistance = Math.min(absoluteX, absoluteY)
    const diagonalFirstPoint = {
      x: start.x + directionX * diagonalDistance,
      y: start.y + directionY * diagonalDistance,
    }
    const straightFirstPoint =
      absoluteX > absoluteY
        ? {
            x: start.x + directionX * (absoluteX - absoluteY),
            y: start.y,
          }
        : {
            x: start.x,
            y: start.y + directionY * (absoluteY - absoluteX),
          }
    const diagonalFirstDistance = Math.hypot(
      pointer.x - diagonalFirstPoint.x,
      pointer.y - diagonalFirstPoint.y
    )
    const straightFirstDistance = Math.hypot(
      pointer.x - straightFirstPoint.x,
      pointer.y - straightFirstPoint.y
    )

    return diagonalFirstDistance <= straightFirstDistance
      ? 'diagonal-first'
      : 'straight-first'
  }

  private clear(): void {
    this.state = idleInteraction
    this.preview.hide()
  }
}
