import type { Point } from '@/engine/geometry/Point'
import type { RouteId, StationId } from '@/game/domain/Ids'

export interface RouteSegmentLayout {
  readonly segmentIndex: number
  readonly centerPoints: readonly Point[]
  readonly points: readonly Point[]
  readonly spanLaneOffsets: readonly number[]
}

export interface TerminalLayout {
  readonly stationId: StationId
  readonly origin: Point
  readonly position: Point
  readonly direction: Point
  readonly port: number
}

export interface RouteLayout {
  readonly routeId: RouteId
  readonly segments: readonly RouteSegmentLayout[]
  readonly startTerminal: TerminalLayout | null
  readonly endTerminal: TerminalLayout | null
}
