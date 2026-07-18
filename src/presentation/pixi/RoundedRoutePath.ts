import type { Graphics } from 'pixi.js'
import type { Point } from '@/engine/geometry/Point'

const CORNER_RADIUS = 10

export function drawRoundedRoutePath(
  graphics: Graphics,
  points: readonly Point[]
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

    if (!previous || !current || !next) {
      continue
    }

    const incomingLength = Math.hypot(
      current.x - previous.x,
      current.y - previous.y
    )
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y)
    const radius = Math.min(
      CORNER_RADIUS,
      incomingLength / 2,
      outgoingLength / 2
    )
    const entryPoint = moveTowards(current, previous, radius)
    const exitPoint = moveTowards(current, next, radius)

    graphics.lineTo(entryPoint.x, entryPoint.y)
    graphics.quadraticCurveTo(current.x, current.y, exitPoint.x, exitPoint.y)
  }

  const last = points.at(-1)

  if (last) {
    graphics.lineTo(last.x, last.y)
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
