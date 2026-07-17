import { StationType } from '@/constants/StationType'
import type { GameCommands } from '@/game/application/GameCommands'

const DEVELOPMENT_STATIONS = [
  { x: 100, y: 100, stationType: StationType.Circle },
  { x: 250, y: 280, stationType: StationType.Triangle },
  { x: 550, y: 280, stationType: StationType.Rectangle },
  { x: 750, y: 300, stationType: StationType.Rectangle },
  { x: 950, y: 400, stationType: StationType.Triangle },
  { x: 100, y: 750, stationType: StationType.Circle },
  { x: 500, y: 450, stationType: StationType.Circle },
  { x: 750, y: 100, stationType: StationType.Triangle },
  { x: 950, y: 100, stationType: StationType.Triangle },
] as const

export function createDevelopmentScenario(commands: GameCommands): void {
  for (const station of DEVELOPMENT_STATIONS) {
    commands.createStation(station)
  }
}
