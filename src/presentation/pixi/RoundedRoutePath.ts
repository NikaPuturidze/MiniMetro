import type { Graphics } from 'pixi.js'
import type { Point } from '@/engine/geometry/Point'

const CORNER_RADIUS = 10

export function drawRoundedRoutePath(
  graphics: Graphics,
  points: readonly Point[],
  centerPoints: readonly Point[] = points,
  spanLaneOffsets: readonly number[] = []
): void {
  const first = points[0]

  if (!first) {
    return
  }

  graphics.moveTo(first.x, first.y)

  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const centerPrevious = centerPoints[index - 1]
    const centerCurrent = centerPoints[index]
    const centerNext = centerPoints[index + 1]

    if (
      !previous ||
      !current ||
      !next ||
      !centerPrevious ||
      !centerCurrent ||
      !centerNext
    ) {
      continue
    }

    const incomingLength = Math.hypot(
      centerCurrent.x - centerPrevious.x,
      centerCurrent.y - centerPrevious.y
    )
    const outgoingLength = Math.hypot(
      centerNext.x - centerCurrent.x,
      centerNext.y - centerCurrent.y
    )
    const radius = Math.min(
      CORNER_RADIUS,
      incomingLength / 2,
      outgoingLength / 2
    )
    const entryPoint = offsetPoint(
      moveTowards(centerCurrent, centerPrevious, radius),
      centerPrevious,
      centerCurrent,
      spanLaneOffsets[index - 1] ?? 0
    )
    const exitPoint = offsetPoint(
      moveTowards(centerCurrent, centerNext, radius),
      centerCurrent,
      centerNext,
      spanLaneOffsets[index] ?? 0
    )

    graphics.lineTo(entryPoint.x, entryPoint.y)
    graphics.quadraticCurveTo(current.x, current.y, exitPoint.x, exitPoint.y)
  }

  const last = points.at(-1)

  if (last) {
    graphics.lineTo(last.x, last.y)
  }
}

function offsetPoint(
  point: Point,
  spanStart: Point,
  spanEnd: Point,
  offset: number
): Point {
  const deltaX = spanEnd.x - spanStart.x
  const deltaY = spanEnd.y - spanStart.y
  const length = Math.hypot(deltaX, deltaY)

  if (length === 0 || offset === 0) {
    return point
  }

  return {
    x: point.x - (deltaY / length) * offset,
    y: point.y + (deltaX / length) * offset,
  }
}

function moveTowards(start: Point, target: Point, distance: number): Point {
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
