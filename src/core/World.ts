import { Container } from 'pixi.js'
import type { StationType } from '@/constants/StationType'
import { RouteColor } from '@/constants/RouteColor'
import { RouteNetwork } from '@/entities/RouteNetwork'
import { Station } from '@/entities/Station'
import { RouteBuilder } from '@/logic/RouteBuilder'

export class World extends Container {
  private readonly routeNetwork = new RouteNetwork([
    RouteColor.Red,
    RouteColor.Blue,
    RouteColor.Green,
  ])

  private readonly stationLayer = new Container()

  private readonly stations: Station[] = []

  private readonly routeBuilder: RouteBuilder

  public constructor(stage: Container) {
    super()

    this.addChild(this.routeNetwork, this.stationLayer)

    this.routeBuilder = new RouteBuilder(stage, this.routeNetwork)
  }

  public createStation(
    x: number,
    y: number,
    stationType: StationType
  ): Station {
    const station = new Station(x, y, stationType)

    this.stations.push(station)
    this.stationLayer.addChild(station)

    return station
  }

  public getRouteNetwork(): RouteNetwork {
    return this.routeNetwork
  }

  public update(_deltaSeconds: number): void {}

  public dispose(): void {
    this.routeBuilder.destroy()
  }
}
