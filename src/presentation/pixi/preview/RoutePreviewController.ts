import type { Point } from '@/engine/geometry/Point'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId, StationId } from '@/game/domain/Ids'
import { OctilinearRouter } from '@/game/layout/OctilinearRouter'
import type { RoutePreviewView } from '../views/RoutePreviewView'

export class RoutePreviewController {
  public constructor(
    private readonly state: GameStateReader,
    private readonly view: RoutePreviewView
  ) {}

  public showExtension(
    stationId: StationId,
    pointer: Point,
    color: number
  ): void {
    const station = this.state.getStation(stationId)

    if (!station) {
      this.view.hide()
      return
    }

    this.view.show(
      OctilinearRouter.route([station, pointer]),
      color,
      true,
      this.state.getStations(),
      new Set([stationId])
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
}
