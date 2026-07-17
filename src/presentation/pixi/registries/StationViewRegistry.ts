import type { GameStateReader } from '@/game/domain/GameState'
import type { StationId } from '@/game/domain/Ids'
import type { WorldView } from '../WorldView'
import { StationView } from '../views/StationView'

export class StationViewRegistry {
  private readonly views = new Map<StationId, StationView>()

  public constructor(
    private readonly world: WorldView,
    private readonly state: GameStateReader
  ) {}

  public create(stationId: StationId): StationView {
    const existing = this.views.get(stationId)

    if (existing) {
      return existing
    }

    const station = this.state.getStation(stationId)

    if (!station) {
      throw new Error(`Station ${stationId} does not exist.`)
    }

    const view = new StationView(stationId, station)

    this.views.set(stationId, view)
    this.world.addStationView(view)

    return view
  }

  public get(stationId: StationId): StationView | undefined {
    return this.views.get(stationId)
  }
}
