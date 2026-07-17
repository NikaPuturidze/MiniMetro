import { Container, FederatedPointerEvent, Graphics } from 'pixi.js'
import { Route } from '@/entities/Route'
import { Station } from '@/entities/Station'
import type { RouteNetwork } from '@/entities/RouteNetwork'
import { OctilinearRouter } from '@/logic/OctilinearRouter'

interface DragState {
  readonly startStation: Station
  readonly route: Route | null
}

export class RouteBuilder {
  private static readonly TERMINAL_HIT_RADIUS = 18
  private static readonly PREVIEW_ALPHA = 0.65
  private static readonly PREVIEW_CAP_LENGTH = 20

  private readonly preview = new Graphics()

  private dragState: DragState | null = null

  private lastRetractedStation: Station | null = null

  public constructor(
    private readonly stage: Container,
    private readonly routeNetwork: RouteNetwork
  ) {
    this.routeNetwork.addChild(this.preview)

    this.stage.on('pointerdown', this.handlePointerDown)

    this.stage.on('globalpointermove', this.handlePointerMove)

    this.stage.on('pointerup', this.handlePointerUp)

    this.stage.on('pointerupoutside', this.handlePointerUpOutside)

    window.addEventListener('keydown', this.handleKeyDown)
  }

  public destroy(): void {
    this.stage.off('pointerdown', this.handlePointerDown)

    this.stage.off('globalpointermove', this.handlePointerMove)

    this.stage.off('pointerup', this.handlePointerUp)

    this.stage.off('pointerupoutside', this.handlePointerUpOutside)

    window.removeEventListener('keydown', this.handleKeyDown)

    this.preview.destroy()
  }

  private readonly handlePointerDown = (event: FederatedPointerEvent): void => {
    if (event.button !== 0 || this.dragState) {
      return
    }

    const pointerPosition = event.getLocalPosition(this.routeNetwork)

    /*
     * Clicking a terminal cap edits its existing route.
     */
    const terminal = this.routeNetwork.findTerminalNear(
      pointerPosition,
      RouteBuilder.TERMINAL_HIT_RADIUS
    )

    if (terminal) {
      terminal.route.hideTerminalAt(terminal.station)

      terminal.route.redraw()

      this.beginDrag(terminal.station, terminal.route)

      return
    }

    /*
     * Clicking the station itself always starts a new
     * route, even when an existing route ends there.
     */
    const station = this.findStation(event.target)

    if (!station) {
      return
    }

    if (!this.routeNetwork.peekAvailableRoute()) {
      return
    }

    this.beginDrag(station, null)
  }

  private readonly handlePointerMove = (event: FederatedPointerEvent): void => {
    const dragState = this.dragState

    if (!dragState) {
      return
    }

    const hoveredStation = this.findStation(event.target)

    if (dragState.route && hoveredStation === dragState.startStation) {
      this.removeHoveredTerminal(dragState)

      if (!this.dragState) {
        return
      }
    }

    if (hoveredStation !== this.lastRetractedStation) {
      this.lastRetractedStation = null
    }

    const pointerPosition = event.getLocalPosition(this.routeNetwork)

    this.drawPreview(
      dragState.startStation,
      pointerPosition,
      this.getPreviewColor()
    )
  }

  private readonly handlePointerUp = (event: FederatedPointerEvent): void => {
    const dragState = this.dragState

    if (!dragState) {
      return
    }

    const targetStation = this.findStation(event.target)

    if (!targetStation) {
      this.cancelDrag()
      return
    }

    if (targetStation === this.lastRetractedStation) {
      if (dragState.route?.stationCount === 1) {
        this.routeNetwork.clearRoute(dragState.route)
      } else {
        dragState.route?.showAllTerminals()
        dragState.route?.redraw()
      }

      this.clearDrag()
      return
    }

    /*
     * A station click without an existing route is not a connection.
     * For a route terminal, however, dropping its handle back onto the
     * terminal station removes that station from the route.
     */
    if (!dragState.route && targetStation === dragState.startStation) {
      this.cancelDrag()
      return
    }

    if (dragState.route) {
      /*
       * Restore terminal visibility before RouteNetwork
       * recalculates the modified route.
       */
      dragState.route.showAllTerminals()

      const result = this.routeNetwork.editRouteTerminal(
        dragState.route,
        dragState.startStation,
        targetStation
      )

      if (result.status !== 'connected' && result.status !== 'removed') {
        dragState.route.redraw()
      }
    } else {
      this.routeNetwork.createRouteBetween(
        dragState.startStation,
        targetStation
      )
    }

    this.clearDrag()
  }

  private readonly handlePointerUpOutside = (): void => {
    this.cancelDrag()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.cancelDrag()
    }
  }

  private beginDrag(startStation: Station, route: Route | null): void {
    this.dragState = {
      startStation,
      route,
    }

    this.lastRetractedStation = null
  }

  private cancelDrag(): void {
    const route = this.dragState?.route

    if (route?.stationCount === 1) {
      /*
       * A single-station route is only a pending extension.  Releasing it
       * without joining another station removes the final endpoint.
       */
      this.routeNetwork.clearRoute(route)
    } else if (route) {
      route.showAllTerminals()
      route.redraw()
    }

    this.clearDrag()
  }

  private clearDrag(): void {
    this.dragState = null
    this.lastRetractedStation = null
    this.preview.clear()
  }

  /*
   * Retract a route as soon as its dragged end re-enters its own station.
   * The new terminal stays attached to the pointer, allowing one continuous
   * drag to remove several stations in sequence.
   */
  private removeHoveredTerminal(dragState: DragState): void {
    const { route, startStation } = dragState

    if (!route) {
      return
    }

    const removingStart = route.getFirstStation() === startStation

    route.showAllTerminals()

    const result = this.routeNetwork.editRouteTerminal(
      route,
      startStation,
      startStation
    )

    if (result.status !== 'removed' || route.isEmpty) {
      this.clearDrag()
      return
    }

    this.lastRetractedStation = startStation

    const nextTerminal = removingStart
      ? route.getFirstStation()
      : route.getLastStation()

    if (!nextTerminal) {
      this.clearDrag()
      return
    }

    route.hideTerminalAt(nextTerminal)
    route.redraw()

    this.dragState = {
      startStation: nextTerminal,
      route,
    }
  }

  private getPreviewColor(): number {
    const route =
      this.dragState?.route ?? this.routeNetwork.peekAvailableRoute()

    return route?.color ?? 0x777777
  }

  private drawPreview(
    start: Station,
    end: { x: number; y: number },
    color: number
  ): void {
    const points = OctilinearRouter.route([
      {
        x: start.x,
        y: start.y,
      },
      end,
    ])

    const first = points[0]
    const beforeLast = points.at(-2)
    const last = points.at(-1)

    this.preview.clear()

    if (!first || !beforeLast || !last) {
      return
    }

    this.preview.moveTo(first.x, first.y)

    for (let index = 1; index < points.length; index++) {
      const point = points[index]

      if (point) {
        this.preview.lineTo(point.x, point.y)
      }
    }

    const direction = this.getUnitDirection(beforeLast, last)

    this.drawPreviewCap(last, direction)

    this.preview.stroke({
      color,
      width: Route.LINE_WIDTH,
      alpha: RouteBuilder.PREVIEW_ALPHA,
      cap: 'butt',
      join: 'round',
    })
  }

  private drawPreviewCap(
    terminal: { x: number; y: number },
    direction: { x: number; y: number }
  ): void {
    const halfLength = RouteBuilder.PREVIEW_CAP_LENGTH / 2

    const normal = {
      x: -direction.y,
      y: direction.x,
    }

    this.preview.moveTo(
      terminal.x - normal.x * halfLength,
      terminal.y - normal.y * halfLength
    )

    this.preview.lineTo(
      terminal.x + normal.x * halfLength,
      terminal.y + normal.y * halfLength
    )
  }

  private getUnitDirection(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): { x: number; y: number } {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const length = Math.hypot(deltaX, deltaY)

    if (length === 0) {
      return { x: 0, y: 0 }
    }

    return {
      x: deltaX / length,
      y: deltaY / length,
    }
  }

  private findStation(target: unknown): Station | null {
    let current = target as Container | null

    while (current) {
      if (current instanceof Station) {
        return current
      }

      current = current.parent
    }

    return null
  }
}
