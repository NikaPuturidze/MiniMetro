import { Container } from 'pixi.js'
import type { Point } from '@/engine/geometry/Point'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type { RouteViewRegistry } from '../registries/RouteViewRegistry'
import { RouteView } from '../views/RouteView'
import { StationView } from '../views/StationView'

export type PointerDownTarget =
  | {
      readonly kind: 'terminal'
      readonly routeId: RouteId
      readonly stationId: StationId
    }
  | { readonly kind: 'station'; readonly stationId: StationId }
  | {
      readonly kind: 'route'
      readonly routeId: RouteId
      readonly segmentIndex: number | null
    }
  | { readonly kind: 'world' }

export class PixiRouteHitTester {
  private static readonly TERMINAL_HIT_RADIUS = 18
  private static readonly TERMINAL_EDGE_INSET = 24

  public constructor(private readonly routeViews: RouteViewRegistry) {}

  public getPointerDownTarget(
    displayTarget: unknown,
    point: Point
  ): PointerDownTarget {
    const terminal = this.findTerminalNear(point)

    if (terminal) {
      return { kind: 'terminal', ...terminal }
    }

    const stationId = this.getStationId(displayTarget)

    if (stationId !== null) {
      return { kind: 'station', stationId }
    }

    const routeId = this.getRouteId(displayTarget)

    return routeId === null
      ? { kind: 'world' }
      : {
          kind: 'route',
          routeId,
          segmentIndex: this.findNearestSegmentIndex(routeId, point),
        }
  }

  public getStationId(displayTarget: unknown): StationId | null {
    let current = displayTarget instanceof Container ? displayTarget : null

    while (current) {
      if (current instanceof StationView) {
        return current.stationId
      }

      current = current.parent
    }

    return null
  }

  private getRouteId(displayTarget: unknown): RouteId | null {
    let current = displayTarget instanceof Container ? displayTarget : null

    while (current) {
      if (current instanceof RouteView) {
        return current.routeId
      }

      current = current.parent
    }

    return null
  }

  private findTerminalNear(
    point: Point
  ): { readonly routeId: RouteId; readonly stationId: StationId } | null {
    let nearest: {
      readonly routeId: RouteId
      readonly stationId: StationId
    } | null = null
    let nearestDistance = PixiRouteHitTester.TERMINAL_HIT_RADIUS

    for (const routeView of this.routeViews.getAll()) {
      for (const terminal of routeView.getVisibleTerminals()) {
        const distance = this.getTerminalEdgeDistance(
          point,
          terminal.origin,
          terminal.position
        )

        if (distance <= nearestDistance) {
          nearestDistance = distance
          nearest = {
            routeId: routeView.routeId,
            stationId: terminal.stationId,
          }
        }
      }
    }

    return nearest
  }

  private findNearestSegmentIndex(
    routeId: RouteId,
    point: Point
  ): number | null {
    const segments = this.routeViews.get(routeId)?.getLayout()?.segments ?? []
    let nearestIndex: number | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const segment of segments) {
      for (let index = 1; index < segment.centerPoints.length; index++) {
        const start = segment.centerPoints[index - 1]
        const end = segment.centerPoints[index]

        if (!start || !end) {
          continue
        }

        const distance = this.getDistanceToLineSegment(point, start, end)

        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = segment.segmentIndex
        }
      }
    }

    return nearestIndex
  }

  private getDistanceToLineSegment(
    point: Point,
    start: Point,
    end: Point
  ): number {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const lengthSquared = deltaX * deltaX + deltaY * deltaY
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
                lengthSquared
            )
          )

    return Math.hypot(
      point.x - (start.x + deltaX * projection),
      point.y - (start.y + deltaY * projection)
    )
  }

  private getTerminalEdgeDistance(
    point: Point,
    station: Point,
    terminal: Point
  ): number {
    const deltaX = terminal.x - station.x
    const deltaY = terminal.y - station.y
    const length = Math.hypot(deltaX, deltaY)

    if (length === 0) {
      return Number.POSITIVE_INFINITY
    }

    const start = {
      x: station.x + (deltaX / length) * PixiRouteHitTester.TERMINAL_EDGE_INSET,
      y: station.y + (deltaY / length) * PixiRouteHitTester.TERMINAL_EDGE_INSET,
    }
    const terminalVectorX = terminal.x - start.x
    const terminalVectorY = terminal.y - start.y
    const terminalLengthSquared =
      terminalVectorX * terminalVectorX + terminalVectorY * terminalVectorY
    const projection =
      ((point.x - start.x) * terminalVectorX +
        (point.y - start.y) * terminalVectorY) /
      terminalLengthSquared
    const clampedProjection = Math.max(0, Math.min(1, projection))
    const closestPoint = {
      x: start.x + terminalVectorX * clampedProjection,
      y: start.y + terminalVectorY * clampedProjection,
    }

    return Math.hypot(point.x - closestPoint.x, point.y - closestPoint.y)
  }
}
