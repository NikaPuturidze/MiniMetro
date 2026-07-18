import type { Point } from '@/engine/geometry/Point'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId, StationId } from '@/game/domain/Ids'
import { OctilinearRouter } from '@/game/layout/OctilinearRouter'
import { RouteLayoutCalculator } from '@/game/layout/RouteLayoutCalculator'
import type { RouteViewRegistry } from '../registries/RouteViewRegistry'
import type { RoutePreviewView } from '../views/RoutePreviewView'

interface TrackSpan {
  readonly lineKey: string
  readonly minimum: number
  readonly maximum: number
  readonly forward: boolean
}

interface ExistingLaneUsage {
  readonly routeId: RouteId
  readonly routeOrder: number
  readonly canonicalOffset: number
}

export class RoutePreviewController {
  private static readonly SAME_ROUTE_LANE_GAP = 4

  public constructor(
    private readonly state: GameStateReader,
    private readonly view: RoutePreviewView,
    private readonly routeViews: RouteViewRegistry
  ) {}

  public showExtension(
    stationId: StationId,
    pointer: Point,
    color: number,
    routeId: RouteId | null
  ): void {
    const station = this.state.getStation(stationId)

    if (!station) {
      this.view.hide()
      return
    }

    const centerPoints = OctilinearRouter.route([station, pointer])
    const candidateRouteId =
      routeId ?? this.state.getAvailableRoutes()[0]?.id ?? null

    this.view.show(
      centerPoints,
      color,
      true,
      this.state.getStations(),
      new Set([stationId]),
      this.calculateExtensionLaneOffsets(centerPoints, candidateRouteId)
    )
  }

  public showInsertion(
    routeId: RouteId,
    segmentIndex: number,
    insertionPoint: Point
  ): void {
    const route = this.state.getRoute(routeId)
    const segment = route?.getSegmentStationIds(segmentIndex)
    const startId = segment?.[0]
    const endId = segment?.[1]
    const start =
      startId === undefined ? undefined : this.state.getStation(startId)
    const end = endId === undefined ? undefined : this.state.getStation(endId)

    if (!route || !start || !end) {
      this.view.hide()
      return
    }

    this.view.show(
      OctilinearRouter.route([start, insertionPoint, end]),
      route.color,
      false,
      this.state.getStations(),
      new Set([
        start.id,
        end.id,
        ...this.getStationIdsAtPoint(insertionPoint),
      ])
    )
  }

  public hide(): void {
    this.view.hide()
  }

  private getStationIdsAtPoint(point: Point): readonly StationId[] {
    return this.state
      .getStations()
      .filter(
        (station) =>
          Math.hypot(station.x - point.x, station.y - point.y) < 0.001
      )
      .map((station) => station.id)
  }

  private calculateExtensionLaneOffsets(
    points: readonly Point[],
    candidateRouteId: RouteId | null
  ): readonly number[] {
    const spanCount = Math.max(0, points.length - 1)

    if (spanCount === 0 || candidateRouteId === null) {
      return new Array(spanCount).fill(0)
    }

    let selectedOffset = 0
    let selectedOverlapCount = 0

    for (let spanIndex = 0; spanIndex < spanCount; spanIndex++) {
      const start = points[spanIndex]
      const end = points[spanIndex + 1]

      if (!start || !end) {
        continue
      }

      const previewSpan = this.createTrackSpan(start, end)

      if (!previewSpan) {
        continue
      }

      const usages = this.getOverlappingLaneUsages(previewSpan)

      if (usages.length <= selectedOverlapCount) {
        continue
      }

      const canonicalOffset = this.getCandidateCanonicalOffset(
        usages,
        candidateRouteId
      )

      selectedOffset = previewSpan.forward
        ? canonicalOffset
        : -canonicalOffset
      selectedOverlapCount = usages.length
    }

    return new Array(spanCount).fill(selectedOffset)
  }

  private getOverlappingLaneUsages(
    previewSpan: TrackSpan
  ): readonly ExistingLaneUsage[] {
    const routeOrder = new Map<RouteId, number>()
    const usages: ExistingLaneUsage[] = []

    this.state.getRoutes().forEach((route, index) => {
      routeOrder.set(route.id, index)
    })

    for (const routeView of this.routeViews.getAll()) {
      const layout = routeView.getLayout()

      if (!layout) {
        continue
      }

      for (const segment of layout.segments) {
        for (
          let spanIndex = 0;
          spanIndex < segment.centerPoints.length - 1;
          spanIndex++
        ) {
          const start = segment.centerPoints[spanIndex]
          const end = segment.centerPoints[spanIndex + 1]

          if (!start || !end) {
            continue
          }

          const span = this.createTrackSpan(start, end)

          if (!span || !this.trackSpansOverlap(previewSpan, span)) {
            continue
          }

          const routeOffset = segment.spanLaneOffsets[spanIndex] ?? 0

          usages.push({
            routeId: routeView.routeId,
            routeOrder: routeOrder.get(routeView.routeId) ?? 0,
            canonicalOffset: span.forward ? routeOffset : -routeOffset,
          })
        }
      }
    }

    return usages
  }

  private getCandidateCanonicalOffset(
    usages: readonly ExistingLaneUsage[],
    candidateRouteId: RouteId
  ): number {
    const candidateOrder =
      this.state
        .getRoutes()
        .findIndex((route) => route.id === candidateRouteId)
    const minimumOrder = Math.min(...usages.map((usage) => usage.routeOrder))
    const placeBefore = candidateOrder < minimumOrder
    const boundaryUsage = usages.reduce((selected, usage) => {
      if (placeBefore) {
        return usage.canonicalOffset < selected.canonicalOffset
          ? usage
          : selected
      }

      return usage.canonicalOffset > selected.canonicalOffset
        ? usage
        : selected
    })
    const spacing =
      RouteLayoutCalculator.LINE_WIDTH +
      (boundaryUsage.routeId === candidateRouteId
        ? RoutePreviewController.SAME_ROUTE_LANE_GAP
        : 0)

    return (
      boundaryUsage.canonicalOffset + (placeBefore ? -spacing : spacing)
    )
  }

  private trackSpansOverlap(first: TrackSpan, second: TrackSpan): boolean {
    return (
      first.lineKey === second.lineKey &&
      Math.min(first.maximum, second.maximum) -
        Math.max(first.minimum, second.minimum) >
        0.001
    )
  }

  private createTrackSpan(start: Point, end: Point): TrackSpan | null {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const epsilon = 0.001

    if (Math.abs(deltaX) < epsilon && Math.abs(deltaY) < epsilon) {
      return null
    }

    let lineKey: string
    let startPosition: number
    let endPosition: number
    let forward: boolean

    if (Math.abs(deltaY) < epsilon) {
      lineKey = `h:${this.getTrackCoordinateKey(start.y)}`
      startPosition = start.x
      endPosition = end.x
      forward = deltaX > 0
    } else if (Math.abs(deltaX) < epsilon) {
      lineKey = `v:${this.getTrackCoordinateKey(start.x)}`
      startPosition = start.y
      endPosition = end.y
      forward = deltaY > 0
    } else {
      const positiveSlope = Math.sign(deltaX) === Math.sign(deltaY)
      const invariant = positiveSlope ? start.y - start.x : start.y + start.x

      lineKey = `${positiveSlope ? 'd+' : 'd-'}:${this.getTrackCoordinateKey(
        invariant
      )}`
      startPosition = start.x
      endPosition = end.x
      forward = deltaX > 0
    }

    return {
      lineKey,
      minimum: Math.min(startPosition, endPosition),
      maximum: Math.max(startPosition, endPosition),
      forward,
    }
  }

  private getTrackCoordinateKey(coordinate: number): number {
    return Math.round(coordinate * 1000)
  }
}
