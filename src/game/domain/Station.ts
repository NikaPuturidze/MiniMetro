import type { StationType } from '@/constants/StationType'
import type { Point } from '@/engine/geometry/Point'
import type { StationId } from './Ids'

export class Station implements Point {
  public constructor(
    public readonly id: StationId,
    public readonly x: number,
    public readonly y: number,
    public readonly stationType: StationType
  ) {}
}
