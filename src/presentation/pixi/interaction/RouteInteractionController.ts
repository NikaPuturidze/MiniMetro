import type { Point } from '@/engine/geometry/Point'
import type { GameCommands } from '@/game/application/GameCommands'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type {
  Route,
  RouteTerminal,
  SegmentRoutingPreference,
} from '@/game/domain/Route'
import type { RouteRules } from '@/game/domain/RouteRules'
import type { StationInteractionEffects } from '../effects/StationInteractionEffects'
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
      readonly action: 'closed' | 'connected' | 'removed' | 'reopened'
    }

export class RouteInteractionController {
  private static readonly STATION_DRAG_THRESHOLD = 6

  private state: RouteInteractionState = idleInteraction

  public constructor(
    private readonly gameState: GameStateReader,
    private readonly commands: GameCommands,
    private readonly rules: RouteRules,
    private readonly routeViews: RouteViewRegistry,
    private readonly preview: RoutePreviewController,
    private readonly stationEffects: StationInteractionEffects
  ) {}

  public pointerDown(input: PointerDownInput): void {
    if (input.button !== 0) {
      return
    }

    if (this.state.kind !== 'idle') {
      this.cancel(true)
    }

    switch (input.target.kind) {
      case 'terminal': {
        const view = this.routeViews.get(input.target.routeId)
        const route = this.gameState.getRoute(input.target.routeId)

        view?.hideTerminalAt(input.target.stationId)
        this.stationEffects.showActiveRouteDrag(
          input.target.stationId,
          route?.color ?? 0x777777
        )
        this.beginRouteDrag(input.target.stationId, input.target.routeId)
        break
      }

      case 'station': {
        const availableRoute = this.gameState.getAvailableRoutes()[0]

        this.stationEffects.showClickPulse(
          input.target.stationId,
          availableRoute?.color ?? 0x777777
        )

        if (availableRoute) {
          this.state = {
            kind: 'station-press',
            stationId: input.target.stationId,
            pointerDownPoint: input.point,
            routeColor: availableRoute.color,
          }
        }
        break
      }

      case 'route':
        this.stationEffects.clearValidTarget()
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
    if (this.state.kind === 'station-press') {
      const press = this.state
      const movement = Math.hypot(
        input.point.x - press.pointerDownPoint.x,
        input.point.y - press.pointerDownPoint.y
      )

      if (movement < RouteInteractionController.STATION_DRAG_THRESHOLD) {
        return
      }

      this.stationEffects.showActiveRouteDrag(press.stationId, press.routeColor)
      this.beginRouteDrag(press.stationId, null)
    }

    if (this.state.kind === 'segment-drag') {
      this.moveSegmentDrag(input)
      return
    }

    if (this.state.kind !== 'route-drag') {
      return
    }

    let drag = this.state

    this.updateValidTargetFeedback(drag, input.stationId)

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
    if (this.state.kind === 'station-press') {
      this.clear()
      return
    }

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
      const result = this.editTerminal(
        drag.routeId,
        drag.startStationId,
        input.stationId
      )

      if (result.success) {
        if (result.action === 'removed') {
          this.removeRouteIfSingleStation(result.routeId)
        } else if (result.action === 'connected') {
          this.showConnectedStationPulse(input.stationId, result.routeId)
        }
      }

      this.showAllTerminals(drag.routeId)
    } else {
      const result = this.startRoute(drag.startStationId, input.stationId)

      if (result.success) {
        this.showConnectedStationPulse(input.stationId, result.routeId)
      }
    }

    this.clear()
  }

  public cancel(immediateEffects = false): void {
    if (this.state.kind === 'idle') {
      return
    }

    if (this.state.kind === 'station-press') {
      this.clear(immediateEffects)
      return
    }

    if (this.state.kind === 'segment-drag') {
      this.routeViews.get(this.state.routeId)?.showAllSegments()
      this.clear(immediateEffects)
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

    this.clear(immediateEffects)
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
      const result = this.commands.insertStation({
        routeId: drag.routeId,
        segmentIndex: drag.segmentIndex,
        stationId,
      })

      if (result.success) {
        this.showConnectedStationPulse(stationId, drag.routeId)
      }
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

    if (result.action === 'closed') {
      this.routeViews.get(result.routeId)?.hideTerminalAt(targetStationId)
      this.showAllTerminals(result.routeId)
      this.stationEffects.clearValidTarget()
      this.stationEffects.addActiveRouteDragStation(
        targetStationId,
        route.color
      )
      this.clear()
      return
    }

    this.routeViews.get(result.routeId)?.hideTerminalAt(targetStationId)
    this.stationEffects.clearValidTarget()

    if (result.action === 'connected') {
      this.stationEffects.showConnectionPulse(targetStationId, route.color)
      this.stationEffects.addActiveRouteDragStation(
        targetStationId,
        route.color
      )
    } else {
      this.stationEffects.transferActiveRouteDrag(targetStationId, route.color)
    }
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

    if (route.isCircular) {
      const reopenedTerminal = route.getCircularClosureSourceTerminal()
      const result = this.commands.reopenRoute({ routeId: route.id })
      const updatedRoute = this.gameState.getRoute(route.id)
      const nextTerminalId =
        reopenedTerminal === 'start'
          ? (updatedRoute?.getFirstStationId() ?? null)
          : (updatedRoute?.getLastStationId() ?? null)

      if (
        !result.success ||
        !updatedRoute ||
        reopenedTerminal === null ||
        nextTerminalId === null
      ) {
        this.clear()
        return
      }

      this.routeViews.get(route.id)?.hideTerminalAt(nextTerminalId)
      this.stationEffects.clearValidTarget()
      this.stationEffects.transferActiveRouteDrag(
        nextTerminalId,
        updatedRoute.color
      )
      this.state = {
        kind: 'route-drag',
        startStationId: nextTerminalId,
        routeId: route.id,
        lastRetractedStationId: drag.startStationId,
        lastJoinedStationId: null,
      }
      return
    }

    const removingStart = terminal === 'start'

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
    this.stationEffects.clearValidTarget()
    this.stationEffects.transferActiveRouteDrag(
      nextTerminalId,
      updatedRoute.color
    )
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

    if (route.isCircular) {
      if (targetStationId !== fromStationId) {
        return { success: false }
      }

      const result = this.commands.reopenRoute({ routeId })

      return result.success
        ? { success: true, routeId, action: 'reopened' }
        : { success: false }
    }

    const stationIds = route.getStationIds()
    const oppositeTerminalId =
      terminal === 'start'
        ? route.getLastStationId()
        : route.getFirstStationId()

    if (
      targetStationId === oppositeTerminalId &&
      this.rules.canCloseRoute(route.id, terminal, this.gameState).success
    ) {
      const result = this.commands.closeRoute({ routeId, terminal })

      return result.success
        ? { success: true, routeId, action: 'closed' }
        : { success: false }
    }

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
    if (route.isCircular) {
      return route.getCircularClosureStationId() === stationId
        ? route.getCircularClosureSourceTerminal()
        : null
    }

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

  private removeRouteIfSingleStation(routeId: RouteId): void {
    if (this.gameState.getRoute(routeId)?.stationCount === 1) {
      this.commands.removeRoute(routeId)
    }
  }

  private showConnectedStationPulse(
    stationId: StationId,
    routeId: RouteId
  ): void {
    const route = this.gameState.getRoute(routeId)

    if (route) {
      this.stationEffects.showConnectionPulse(stationId, route.color)
    }
  }

  private updateValidTargetFeedback(
    drag: Extract<RouteInteractionState, { readonly kind: 'route-drag' }>,
    stationId: StationId | null
  ): void {
    if (
      stationId === null ||
      stationId === drag.startStationId ||
      !this.isValidRouteTarget(drag, stationId)
    ) {
      this.stationEffects.clearValidTarget()
      return
    }

    this.stationEffects.showValidTarget(stationId, this.getPreviewColor())
  }

  private isValidRouteTarget(
    drag: Extract<RouteInteractionState, { readonly kind: 'route-drag' }>,
    targetStationId: StationId
  ): boolean {
    if (targetStationId === drag.lastRetractedStationId) {
      return false
    }

    if (targetStationId === drag.lastJoinedStationId) {
      return true
    }

    if (drag.routeId === null) {
      return this.rules.canStartRoute(
        drag.startStationId,
        targetStationId,
        this.gameState
      ).success
    }

    const route = this.gameState.getRoute(drag.routeId)
    const terminal = route
      ? this.getTerminalAt(route, drag.startStationId)
      : null

    if (!route || terminal === null) {
      return false
    }

    const stationIds = route.getStationIds()
    const oppositeTerminalId =
      terminal === 'start'
        ? route.getLastStationId()
        : route.getFirstStationId()

    if (
      targetStationId === oppositeTerminalId &&
      this.rules.canCloseRoute(route.id, terminal, this.gameState).success
    ) {
      return true
    }

    const adjacentStationId =
      terminal === 'start' ? stationIds[1] : stationIds.at(-2)

    if (
      targetStationId === drag.startStationId ||
      targetStationId === adjacentStationId
    ) {
      return this.rules.canRemoveTerminal(route.id, terminal, this.gameState)
        .success
    }

    return this.rules.canExtendRoute(
      route.id,
      targetStationId,
      terminal,
      this.gameState
    ).success
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
    const segment = route?.getSegmentStationIds(segmentIndex)
    const startId = segment?.[0]
    const endId = segment?.[1]
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

  private clear(immediateEffects = false): void {
    this.state = idleInteraction
    this.preview.hide()
    this.stationEffects.clearValidTarget()

    if (immediateEffects) {
      this.stationEffects.clearAll()
    } else {
      this.stationEffects.finishActiveRouteDrag()
    }
  }
}
