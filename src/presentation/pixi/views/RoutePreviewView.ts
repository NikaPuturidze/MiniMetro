import { Graphics } from 'pixi.js'
import type { Point } from '@/engine/geometry/Point'
import type { StationId } from '@/game/domain/Ids'
import type { Station } from '@/game/domain/Station'
import { RouteLayoutCalculator } from '@/game/layout/RouteLayoutCalculator'
import { drawRoundedRoutePath } from '../RoundedRoutePath'
import { drawRouteSkipMarkers } from '../RouteSkipMarker'

export class RoutePreviewView extends Graphics {
  private static readonly PREVIEW_ALPHA = 0.65
  private static readonly PREVIEW_CAP_LENGTH = 20

  public show(
    points: readonly Point[],
    color: number,
    showTerminalCap: boolean,
    stations: readonly Station[],
    servedStationIds: ReadonlySet<StationId>
  ): void {
    const first = points[0]

    this.clear()

    if (!first) {
      return
    }

    drawRoundedRoutePath(this, points)

    if (showTerminalCap) {
      const beforeLast = points.at(-2)
      const last = points.at(-1)

      if (beforeLast && last) {
        this.drawTerminalCap(last, this.getUnitDirection(beforeLast, last))
      }
    }

    this.stroke({
      color,
      width: RouteLayoutCalculator.LINE_WIDTH,
      alpha: RoutePreviewView.PREVIEW_ALPHA,
      cap: 'butt',
      join: 'round',
    })

    drawRouteSkipMarkers(
      this,
      [{ points, servedStationIds }],
      stations
    )
  }

  public hide(): void {
    this.clear()
  }

  private drawTerminalCap(terminal: Point, direction: Point): void {
    const halfLength = RoutePreviewView.PREVIEW_CAP_LENGTH / 2
    const normal = {
      x: -direction.y,
      y: direction.x,
    }

    this.moveTo(
      terminal.x - normal.x * halfLength,
      terminal.y - normal.y * halfLength
    )
    this.lineTo(
      terminal.x + normal.x * halfLength,
      terminal.y + normal.y * halfLength
    )
  }

  private getUnitDirection(start: Point, end: Point): Point {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const length = Math.hypot(deltaX, deltaY)

    return length === 0
      ? { x: 0, y: 0 }
      : { x: deltaX / length, y: deltaY / length }
  }
}
