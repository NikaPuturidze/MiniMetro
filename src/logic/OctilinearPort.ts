export interface RoutePoint {
  readonly x: number
  readonly y: number
}

const PORT_DIRECTIONS: readonly RoutePoint[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
]

export class OctilinearPort {
  public static fromVector(vector: RoutePoint): number {
    const angle = Math.atan2(vector.y, vector.x)

    return (Math.round(angle / (Math.PI / 4)) + 8) % 8
  }

  public static getDirection(port: number): RoutePoint {
    const normalizedPort = ((port % 8) + 8) % 8
    const direction = PORT_DIRECTIONS[normalizedPort]

    if (!direction) {
      throw new Error('Invalid terminal port.')
    }

    return direction
  }
}
