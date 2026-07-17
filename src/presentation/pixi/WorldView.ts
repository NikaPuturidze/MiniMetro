import { Container } from 'pixi.js'
import type { RouteView } from './views/RouteView'
import type { RoutePreviewView } from './views/RoutePreviewView'
import type { StationView } from './views/StationView'

export class WorldView extends Container {
  private readonly routeLayer = new Container()
  private readonly previewLayer = new Container()
  private readonly stationLayer = new Container()

  public constructor() {
    super()
    this.addChild(this.routeLayer, this.previewLayer, this.stationLayer)
  }

  public addRouteView(view: RouteView): void {
    this.routeLayer.addChild(view)
  }

  public addPreviewView(view: RoutePreviewView): void {
    this.previewLayer.addChild(view)
  }

  public addStationView(view: StationView): void {
    this.stationLayer.addChild(view)
  }
}
