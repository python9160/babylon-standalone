// 1. Top-level imports from Babylon packages (NO subpaths, NO .js)
import {
  Scene,
  Mesh,
  AssetContainer,
  LoadAssetContainerAsync,
  Nullable,
} from "@babylonjs/core";

import "@babylonjs/loaders/glTF/index.js";

// 2. Relative local imports (MUST have .js)
import { Base64String } from "../../types/global.js";

export abstract class Entity {
  protected scene: Scene;
  protected container?: AssetContainer;
  protected mesh?: Mesh;
  protected collider?: Mesh;

  private _updateObserver: Nullable<() => void> = null;

  protected static readonly modelPath: () => Base64String;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  protected abstract update(): void;

  protected onLoaded(container: AssetContainer): void {
    // Optional hook for subclasses to do setup after loading
  }

  protected enableUpdate(): void {
    this._updateObserver = () => this.update();
    this.scene.onBeforeRenderObservable.add(this._updateObserver);
  }

  protected disableUpdate(): void {
    if (this._updateObserver) {
      this.scene.onBeforeRenderObservable.removeCallback(this._updateObserver);
      this._updateObserver = null;
    }
  }

  protected static async _Create<T extends Entity>(
    scene: Scene,
    EntityType: new (scene: Scene) => T,
  ): Promise<T> {
    const entity = new EntityType(scene);
    const container = await LoadAssetContainerAsync(this.modelPath(), scene);
    container.addAllToScene();
    entity.container = container;

    entity.onLoaded(container);
    entity.enableUpdate();

    return entity;
  }
}
