import { Graphics, type DestroyOptions, type Ticker } from 'pixi.js'
import type { Point } from '@/engine/geometry/Point'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type { Route } from '@/game/domain/Route'
import type { Station } from '@/game/domain/Station'
import type { RouteLayout, TerminalLayout } from '@/game/layout/RouteLayout'
import { drawRoundedRoutePath } from '../RoundedRoutePath'
import { drawRouteSkipMarkers } from '../RouteSkipMarker'
import { STATION_BORDER_WIDTH, STATION_SIZE } from '../StationShapeGeometry'

type TerminalKey = 'start' | 'end'

interface TerminalTransition {
  readonly previous: TerminalLayout | null
  readonly next: TerminalLayout | null
  elapsedSeconds: number
}

export class RouteView extends Graphics {
  private static readonly TERMINAL_CAP_LENGTH = STATION_SIZE * 2
  private static readonly ROUTE_STROKE_WIDTH = STATION_BORDER_WIDTH * 2
  private static readonly TERMINAL_COLLAPSE_DURATION_SECONDS = 0.14
  private static readonly TERMINAL_EXPAND_DURATION_SECONDS = 0.18
  private layout: RouteLayout | null = null
  private route: Route | null = null
  private stations: readonly Station[] = []
  private readonly hiddenTerminalStationIds = new Set<StationId>()
  private hiddenSegmentIndex: number | null = null
  private readonly terminalTransitions = new Map<
    TerminalKey,
    TerminalTransition
  >()
  private isAnimationTicking = false

  public constructor(
    public readonly routeId: RouteId,
    private readonly color: number,
    private readonly ticker: Ticker
  ) {
    super()
    this.eventMode = 'static'
    this.cursor = 'pointer'
  }

  public render(
    layout: RouteLayout | null,
    route: Route | null,
    stations: readonly Station[]
  ): void {
    const previousLayout = this.layout

    this.layout = layout
    this.route = route
    this.stations = stations
    this.updateTerminalTransition(
      'start',
      previousLayout?.startTerminal ?? null,
      layout?.startTerminal ?? null
    )
    this.updateTerminalTransition(
      'end',
      previousLayout?.endTerminal ?? null,
      layout?.endTerminal ?? null
    )
    this.updateAnimationTicker()
    this.redraw()
  }

  public hideTerminalAt(stationId: StationId): void {
    if (
      this.layout?.startTerminal?.stationId === stationId ||
      this.layout?.endTerminal?.stationId === stationId
    ) {
      this.hiddenTerminalStationIds.add(stationId)
      this.redraw()
    }
  }

  public showAllTerminals(): void {
    const hiddenStationIds = new Set(this.hiddenTerminalStationIds)

    this.hiddenTerminalStationIds.clear()
    this.restartRevealedTerminalTransition(
      'start',
      this.layout?.startTerminal ?? null,
      hiddenStationIds
    )
    this.restartRevealedTerminalTransition(
      'end',
      this.layout?.endTerminal ?? null,
      hiddenStationIds
    )
    this.updateAnimationTicker()
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
        terminal !== null &&
        !this.hiddenTerminalStationIds.has(terminal.stationId)
    )
  }

  public getLayout(): RouteLayout | null {
    return this.layout
  }

  public override destroy(options?: DestroyOptions): void {
    this.stopAnimationTicker()
    super.destroy(options)
  }

  private redraw(): void {
    this.clear()

    if (!this.layout && this.terminalTransitions.size === 0) {
      return
    }

    const visibleSegments = (this.layout?.segments ?? []).filter(
      (segment) => segment.segmentIndex !== this.hiddenSegmentIndex
    )

    for (const segment of visibleSegments) {
      drawRoundedRoutePath(
        this,
        segment.points,
        segment.centerPoints,
        segment.spanLaneOffsets
      )
    }

    this.drawTerminalState('start', this.layout?.startTerminal ?? null)
    this.drawTerminalState('end', this.layout?.endTerminal ?? null)

    this.stroke({
      color: this.color,
      width: RouteView.ROUTE_STROKE_WIDTH,
      cap: 'butt',
      join: 'round',
    })

    drawRouteSkipMarkers(
      this,
      visibleSegments.map((segment) => ({
        points: segment.points,
        centerPoints: segment.centerPoints,
        spanLaneOffsets: segment.spanLaneOffsets,
        servedStationIds: new Set(
          this.route?.getSegmentStationIds(segment.segmentIndex) ?? []
        ),
      })),
      this.stations
    )
  }

  private updateTerminalTransition(
    key: TerminalKey,
    previous: TerminalLayout | null,
    next: TerminalLayout | null
  ): void {
    const activeTransition = this.terminalTransitions.get(key)

    if (activeTransition && this.isSameTerminal(activeTransition.next, next)) {
      return
    }

    if (this.isSameTerminal(previous, next)) {
      this.terminalTransitions.delete(key)
      return
    }

    if (!previous && !next) {
      this.terminalTransitions.delete(key)
      return
    }

    this.terminalTransitions.set(key, {
      previous,
      next,
      elapsedSeconds: 0,
    })
  }

  private drawTerminalState(
    key: TerminalKey,
    current: TerminalLayout | null
  ): void {
    const transition = this.terminalTransitions.get(key)

    if (!transition) {
      this.drawTerminal(current, 1)
      return
    }

    const collapseProgress = this.clampProgress(
      transition.elapsedSeconds / RouteView.TERMINAL_COLLAPSE_DURATION_SECONDS
    )
    const expandProgress = this.clampProgress(
      (transition.elapsedSeconds -
        RouteView.TERMINAL_COLLAPSE_DURATION_SECONDS) /
        RouteView.TERMINAL_EXPAND_DURATION_SECONDS
    )

    this.drawTerminal(
      transition.previous,
      1 - this.easeInOutCubic(collapseProgress)
    )
    this.drawTerminal(transition.next, this.easeInOutCubic(expandProgress))
  }

  private drawTerminal(terminal: TerminalLayout | null, scale: number): void {
    if (
      !terminal ||
      this.hiddenTerminalStationIds.has(terminal.stationId) ||
      scale <= 0
    ) {
      return
    }

    const stemCenter = {
      x: (terminal.origin.x + terminal.position.x) / 2,
      y: (terminal.origin.y + terminal.position.y) / 2,
    }
    const halfStem = {
      x: ((terminal.position.x - terminal.origin.x) / 2) * scale,
      y: ((terminal.position.y - terminal.origin.y) / 2) * scale,
    }
    const animatedCapPosition = {
      x: stemCenter.x + halfStem.x,
      y: stemCenter.y + halfStem.y,
    }

    this.moveTo(stemCenter.x - halfStem.x, stemCenter.y - halfStem.y)
    this.lineTo(animatedCapPosition.x, animatedCapPosition.y)
    this.drawTerminalCap(terminal, animatedCapPosition, scale)
  }

  private drawTerminalCap(
    terminal: TerminalLayout,
    position: Point,
    scale: number
  ): void {
    const halfLength = (RouteView.TERMINAL_CAP_LENGTH / 2) * scale
    const normal = {
      x: -terminal.direction.y,
      y: terminal.direction.x,
    }

    this.moveTo(
      position.x - normal.x * halfLength,
      position.y - normal.y * halfLength
    )
    this.lineTo(
      position.x + normal.x * halfLength,
      position.y + normal.y * halfLength
    )
  }

  private readonly updateAnimation = (ticker: Ticker): void => {
    const totalDuration =
      RouteView.TERMINAL_COLLAPSE_DURATION_SECONDS +
      RouteView.TERMINAL_EXPAND_DURATION_SECONDS

    for (const [key, transition] of this.terminalTransitions) {
      transition.elapsedSeconds += ticker.deltaMS / 1000

      const duration = transition.next
        ? totalDuration
        : RouteView.TERMINAL_COLLAPSE_DURATION_SECONDS

      if (transition.elapsedSeconds >= duration) {
        this.terminalTransitions.delete(key)
      }
    }

    this.updateAnimationTicker()
    this.redraw()
  }

  private updateAnimationTicker(): void {
    if (this.terminalTransitions.size > 0 && !this.isAnimationTicking) {
      this.ticker.add(this.updateAnimation)
      this.isAnimationTicking = true
    } else if (this.terminalTransitions.size === 0) {
      this.stopAnimationTicker()
    }
  }

  private restartRevealedTerminalTransition(
    key: TerminalKey,
    terminal: TerminalLayout | null,
    hiddenStationIds: ReadonlySet<StationId>
  ): void {
    const transition = this.terminalTransitions.get(key)

    if (!terminal) {
      if (
        transition?.previous &&
        hiddenStationIds.has(transition.previous.stationId)
      ) {
        this.terminalTransitions.delete(key)
      }
      return
    }

    if (!hiddenStationIds.has(terminal.stationId)) {
      if (
        transition?.previous &&
        hiddenStationIds.has(transition.previous.stationId)
      ) {
        this.terminalTransitions.delete(key)
      }
      return
    }

    this.terminalTransitions.set(key, {
      previous: null,
      next: terminal,
      elapsedSeconds: RouteView.TERMINAL_COLLAPSE_DURATION_SECONDS,
    })
  }

  private stopAnimationTicker(): void {
    if (!this.isAnimationTicking) {
      return
    }

    this.ticker.remove(this.updateAnimation)
    this.isAnimationTicking = false
  }

  private isSameTerminal(
    first: TerminalLayout | null,
    second: TerminalLayout | null
  ): boolean {
    return (
      first === second ||
      (first !== null &&
        second !== null &&
        first.stationId === second.stationId &&
        first.port === second.port)
    )
  }

  private clampProgress(value: number): number {
    return Math.max(0, Math.min(1, value))
  }

  private easeInOutCubic(value: number): number {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2
  }
}
