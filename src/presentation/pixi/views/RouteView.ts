import { Graphics } from 'pixi.js'
import type { Point } from '@/engine/geometry/Point'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type { RouteLayout, TerminalLayout } from '@/game/layout/RouteLayout'
import { RouteLayoutCalculator } from '@/game/layout/RouteLayoutCalculator'

export class RouteView extends Graphics {
  private static readonly TERMINAL_CAP_LENGTH = 30
  private static readonly CORNER_RADIUS = 10

  private layout: RouteLayout | null = null
  private hiddenTerminalStationId: StationId | null = null
  private hiddenSegmentIndex: number | null = null

  public constructor(
    public readonly routeId: RouteId,
    private readonly color: number
  ) {
    super()
    this.eventMode = 'static'
    this.cursor = 'pointer'
  }

  public render(layout: RouteLayout | null): void {
    this.layout = layout
    this.redraw()
  }

  public hideTerminalAt(stationId: StationId): void {
    if (
      this.layout?.startTerminal?.stationId === stationId ||
      this.layout?.endTerminal?.stationId === stationId
    ) {
      this.hiddenTerminalStationId = stationId
      this.redraw()
    }
  }

  public showAllTerminals(): void {
    this.hiddenTerminalStationId = null
    this.redraw()
  }

  public hideSegment(segmentIndex: number): void {
    if (
      segmentIndex >= 0 &&
      segmentIndex < (this.layout?.segments.length ?? 0)
    ) {
      this.hiddenSegmentIndex = segmentIndex
      this.redraw()
    }
  }

  public showAllSegments(): void {
    this.hiddenSegmentIndex = null
    this.redraw()
  }

  public getVisibleTerminals(): readonly TerminalLayout[] {
    const terminals = [
      this.layout?.startTerminal ?? null,
      this.layout?.endTerminal ?? null,
    ]

    return terminals.filter(
      (terminal): terminal is TerminalLayout =>
        terminal !== null && terminal.stationId !== this.hiddenTerminalStationId
    )
  }

  public getLayout(): RouteLayout | null {
    return this.layout
  }

  private redraw(): void {
    this.clear()

    if (!this.layout) {
      return
    }

    for (const segment of this.layout.segments) {
      if (segment.segmentIndex !== this.hiddenSegmentIndex) {
        this.drawRoundedPath(segment.points)
      }
    }

    for (const terminal of this.getVisibleTerminals()) {
      this.moveTo(terminal.origin.x, terminal.origin.y)
      this.lineTo(terminal.position.x, terminal.position.y)
      this.drawTerminalCap(terminal)
    }

    this.stroke({
      color: this.color,
      width: RouteLayoutCalculator.LINE_WIDTH,
      cap: 'butt',
      join: 'round',
    })
  }

  private drawRoundedPath(points: readonly Point[]): void {
    const first = points[0]

    if (!first) {
      return
    }

    this.moveTo(first.x, first.y)

    for (let index = 1; index < points.length - 1; index++) {
      const previous = points[index - 1]
      const current = points[index]
      const next = points[index + 1]

      if (!previous || !current || !next) {
        continue
      }

      const incomingLength = Math.hypot(
        current.x - previous.x,
        current.y - previous.y
      )
      const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y)
      const radius = Math.min(
        RouteView.CORNER_RADIUS,
        incomingLength / 2,
        outgoingLength / 2
      )
      const entryPoint = this.moveTowards(current, previous, radius)
      const exitPoint = this.moveTowards(current, next, radius)

      this.lineTo(entryPoint.x, entryPoint.y)
      this.quadraticCurveTo(current.x, current.y, exitPoint.x, exitPoint.y)
    }

    const last = points.at(-1)

    if (last) {
      this.lineTo(last.x, last.y)
    }
  }

  private drawTerminalCap(terminal: TerminalLayout): void {
    const halfLength = RouteView.TERMINAL_CAP_LENGTH / 2
    const normal = {
      x: -terminal.direction.y,
      y: terminal.direction.x,
    }

    this.moveTo(
      terminal.position.x - normal.x * halfLength,
      terminal.position.y - normal.y * halfLength
    )
    this.lineTo(
      terminal.position.x + normal.x * halfLength,
      terminal.position.y + normal.y * halfLength
    )
  }

  private moveTowards(start: Point, target: Point, distance: number): Point {
    const deltaX = target.x - start.x
    const deltaY = target.y - start.y
    const length = Math.hypot(deltaX, deltaY)

    if (length === 0) {
      return start
    }

    return {
      x: start.x + (deltaX / length) * distance,
      y: start.y + (deltaY / length) * distance,
    }
  }
}
