import { Container, Graphics, type DestroyOptions } from 'pixi.js'
import { StationType } from '@/constants/StationType'
import type { Point } from '@/engine/geometry/Point'
import type { StationId } from '@/game/domain/Ids'
import type { Station } from '@/game/domain/Station'
import { RouteLayoutCalculator } from '@/game/layout/RouteLayoutCalculator'
import { drawRoundedRoutePath } from './RoundedRoutePath'
import {
  getStationOuterRadius,
  STATION_BORDER_WIDTH,
  STATION_FILL_COLOR,
  STATION_SIZE,
  STATION_TRIANGLE_SCALE,
} from './StationShapeGeometry'

export interface RouteSkipPath {
  readonly points: readonly Point[]
  readonly centerPoints?: readonly Point[]
  readonly spanLaneOffsets?: readonly number[]
  readonly servedStationIds: ReadonlySet<StationId>
}

interface MarkerEntry {
  readonly cut: Graphics
  readonly mask: Graphics
}

const SKIP_CUT_WIDTH = 3
const SKIP_CUT_EXTENSION = STATION_SIZE
const SKIP_MASK_WIDTH =
  RouteLayoutCalculator.LINE_WIDTH + SKIP_CUT_WIDTH * 2

export class RouteSkipMarkerView extends Container {
  private readonly entries: MarkerEntry[] = []

  public constructor() {
    super()
    this.eventMode = 'none'
  }

  public draw(
    paths: readonly RouteSkipPath[],
    stations: readonly Station[]
  ): void {
    let entryIndex = 0

    for (const path of paths) {
      const skippedStations = stations.filter(
        (station) =>
          !path.servedStationIds.has(station.id) &&
          doesPathCrossStation(path.points, station)
      )

      if (skippedStations.length === 0) {
        continue
      }

      const entry = this.getEntry(entryIndex)

      entryIndex++
      entry.cut.clear()
      entry.mask.clear()
      entry.cut.visible = true
      entry.mask.visible = true

      drawRoundedRoutePath(
        entry.cut,
        path.points,
        path.centerPoints ?? path.points,
        path.spanLaneOffsets ?? []
      )
      entry.cut.stroke({
        color: STATION_FILL_COLOR,
        width: SKIP_CUT_WIDTH,
        cap: 'round',
        join: 'round',
      })

      for (const station of skippedStations) {
        const markerRadius =
          getStationOuterRadius(station.stationType) + SKIP_CUT_EXTENSION

        drawMarkerMask(entry.mask, path.points, station, markerRadius)
      }

      entry.mask.stroke({
        color: 0xffffff,
        width: SKIP_MASK_WIDTH,
        cap: 'butt',
        join: 'round',
      })
      entry.cut.mask = entry.mask
    }

    for (let index = entryIndex; index < this.entries.length; index++) {
      const entry = this.entries[index]

      if (entry) {
        entry.cut.clear()
        entry.mask.clear()
        entry.cut.visible = false
        entry.mask.visible = false
      }
    }
  }

  public override destroy(options?: DestroyOptions): void {
    for (const entry of this.entries) {
      entry.cut.mask = null
    }

    this.entries.length = 0
    super.destroy(options)
  }

  private getEntry(index: number): MarkerEntry {
    const existing = this.entries[index]

    if (existing) {
      return existing
    }

    const cut = new Graphics()
    const mask = new Graphics()
    const entry = { cut, mask }

    cut.eventMode = 'none'
    mask.eventMode = 'none'
    this.entries.push(entry)
    this.addChild(cut, mask)

    return entry
  }
}

function drawMarkerMask(
  graphics: Graphics,
  points: readonly Point[],
  center: Point,
  radius: number
): void {
  let clippedPoints: Point[] = []
  let canContinue = false

  const flush = (): void => {
    if (clippedPoints.length >= 2) {
      drawRoundedRoutePath(graphics, clippedPoints)
    }

    clippedPoints = []
  }

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]

    if (!start || !end) {
      flush()
      canContinue = false
      continue
    }

    const clipped = clipSpanToCircle(start, end, center, radius)

    if (!clipped) {
      flush()
      canContinue = false
      continue
    }

    const clippedStart = interpolatePoint(
      start,
      end,
      clipped.startProgress
    )
    const clippedEnd = interpolatePoint(start, end, clipped.endProgress)
    const continuesPrevious =
      clippedPoints.length > 0 &&
      canContinue &&
      clipped.startProgress <= 0.001

    if (continuesPrevious) {
      clippedPoints.push(clippedEnd)
    } else {
      flush()
      clippedPoints = [clippedStart, clippedEnd]
    }

    canContinue = clipped.endProgress >= 0.999
  }

  flush()
}

function clipSpanToCircle(
  start: Point,
  end: Point,
  center: Point,
  radius: number
): {
  readonly startProgress: number
  readonly endProgress: number
} | null {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const relativeX = start.x - center.x
  const relativeY = start.y - center.y
  const a = deltaX * deltaX + deltaY * deltaY

  if (a === 0) {
    return null
  }

  const b = 2 * (relativeX * deltaX + relativeY * deltaY)
  const c =
    relativeX * relativeX + relativeY * relativeY - radius * radius
  const discriminant = b * b - 4 * a * c

  if (discriminant < 0) {
    return null
  }

  const root = Math.sqrt(discriminant)
  const firstProgress = (-b - root) / (2 * a)
  const secondProgress = (-b + root) / (2 * a)
  const startProgress = Math.max(0, Math.min(firstProgress, secondProgress))
  const endProgress = Math.min(1, Math.max(firstProgress, secondProgress))

  return endProgress - startProgress <= 0.001
    ? null
    : { startProgress, endProgress }
}

function interpolatePoint(start: Point, end: Point, progress: number): Point {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  }
}

function doesPathCrossStation(
  points: readonly Point[],
  station: Station
): boolean {
  const totalLength = getPathLength(points)

  if (totalLength === 0) {
    return false
  }

  let traversedLength = 0
  const endpointClearance = getStationOuterRadius(station.stationType)

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]

    if (!start || !end) {
      continue
    }

    const spanLength = Math.hypot(end.x - start.x, end.y - start.y)
    const closest = getClosestPointOnSpan(station, start, end)
    const crossingPathPosition =
      traversedLength + closest.progress * spanLength

    if (
      doesSpanCrossStation(start, end, station) &&
      crossingPathPosition > endpointClearance &&
      totalLength - crossingPathPosition > endpointClearance
    ) {
      return true
    }

    traversedLength += spanLength
  }

  return false
}

function doesSpanCrossStation(
  start: Point,
  end: Point,
  station: Station
): boolean {
  const routeRadius = RouteLayoutCalculator.LINE_WIDTH / 2
  const borderRadius = STATION_BORDER_WIDTH / 2

  if (station.stationType === StationType.Circle) {
    return (
      getClosestPointOnSpan(station, start, end).distance <=
      STATION_SIZE + borderRadius + routeRadius
    )
  }

  const polygon =
    station.stationType === StationType.Rectangle
      ? createRectanglePolygon(station)
      : createTrianglePolygon(station)

  return (
    getDistanceFromSpanToPolygon(start, end, polygon) <=
    borderRadius + routeRadius
  )
}

function createRectanglePolygon(center: Point): readonly Point[] {
  return [
    { x: center.x - STATION_SIZE, y: center.y - STATION_SIZE },
    { x: center.x + STATION_SIZE, y: center.y - STATION_SIZE },
    { x: center.x + STATION_SIZE, y: center.y + STATION_SIZE },
    { x: center.x - STATION_SIZE, y: center.y + STATION_SIZE },
  ]
}

function createTrianglePolygon(center: Point): readonly Point[] {
  const triangleSize = STATION_SIZE * STATION_TRIANGLE_SCALE
  const halfWidth = (Math.sqrt(3) / 2) * triangleSize
  const halfHeight = triangleSize / 2

  return [
    { x: center.x, y: center.y - triangleSize },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ]
}

function getDistanceFromSpanToPolygon(
  start: Point,
  end: Point,
  polygon: readonly Point[]
): number {
  if (
    isPointInsidePolygon(start, polygon) ||
    isPointInsidePolygon(end, polygon)
  ) {
    return 0
  }

  let minimumDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < polygon.length; index++) {
    const edgeStart = polygon[index]
    const edgeEnd = polygon[(index + 1) % polygon.length]

    if (!edgeStart || !edgeEnd) {
      continue
    }

    if (spansIntersect(start, end, edgeStart, edgeEnd)) {
      return 0
    }

    minimumDistance = Math.min(
      minimumDistance,
      getClosestPointOnSpan(start, edgeStart, edgeEnd).distance,
      getClosestPointOnSpan(end, edgeStart, edgeEnd).distance,
      getClosestPointOnSpan(edgeStart, start, end).distance,
      getClosestPointOnSpan(edgeEnd, start, end).distance
    )
  }

  return minimumDistance
}

function isPointInsidePolygon(
  point: Point,
  polygon: readonly Point[]
): boolean {
  let inside = false

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index++
  ) {
    const current = polygon[index]
    const previous = polygon[previousIndex]

    if (!current || !previous) {
      continue
    }

    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x

    if (crosses) {
      inside = !inside
    }
  }

  return inside
}

function spansIntersect(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point
): boolean {
  const firstStartSide = getCrossProduct(firstStart, firstEnd, secondStart)
  const firstEndSide = getCrossProduct(firstStart, firstEnd, secondEnd)
  const secondStartSide = getCrossProduct(secondStart, secondEnd, firstStart)
  const secondEndSide = getCrossProduct(secondStart, secondEnd, firstEnd)
  const epsilon = 0.001

  if (
    firstStartSide * firstEndSide < -epsilon &&
    secondStartSide * secondEndSide < -epsilon
  ) {
    return true
  }

  return (
    (Math.abs(firstStartSide) <= epsilon &&
      isPointOnSpan(secondStart, firstStart, firstEnd)) ||
    (Math.abs(firstEndSide) <= epsilon &&
      isPointOnSpan(secondEnd, firstStart, firstEnd)) ||
    (Math.abs(secondStartSide) <= epsilon &&
      isPointOnSpan(firstStart, secondStart, secondEnd)) ||
    (Math.abs(secondEndSide) <= epsilon &&
      isPointOnSpan(firstEnd, secondStart, secondEnd))
  )
}

function getCrossProduct(start: Point, end: Point, point: Point): number {
  return (
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x)
  )
}

function isPointOnSpan(point: Point, start: Point, end: Point): boolean {
  const epsilon = 0.001

  return (
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  )
}

function getPathLength(points: readonly Point[]): number {
  let length = 0

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]

    if (start && end) {
      length += Math.hypot(end.x - start.x, end.y - start.y)
    }
  }

  return length
}

function getClosestPointOnSpan(
  point: Point,
  start: Point,
  end: Point
): { readonly distance: number; readonly progress: number } {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY

  if (lengthSquared === 0) {
    return {
      distance: Math.hypot(point.x - start.x, point.y - start.y),
      progress: 0,
    }
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
        lengthSquared
    )
  )
  const closestX = start.x + progress * deltaX
  const closestY = start.y + progress * deltaY

  return {
    distance: Math.hypot(point.x - closestX, point.y - closestY),
    progress,
  }
}
