import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Nullable } from "@babylonjs/core/types";
import { Base64String } from "../../types/global";
import "@babylonjs/loaders/glTF";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

export abstract class Entity {
  protected container?: AssetContainer;
  protected mesh?: Mesh;
  protected collider?: Mesh;
  public root: TransformNode = new TransformNode("entityRoot");

  // This is the "contract".
  // Any class that extends Entity MUST provide a modelPath instance getter.
  protected abstract get modelPath(): Base64String;

  private _updateObserver: Nullable<() => void> = null;
  private lastTime: number = window.performance.now();

  // update method to be implemented by subclasses
  protected abstract update(dt: number): void;

  constructor(protected scene: Scene) {}

  protected setRoot(node: TransformNode) {
    // delete previous root if exists
    if (this.root) {
      this.root.dispose();
    }
    this.root = node;
  }

  // internal update method that takes care of delta time calculation
  private _update() {
    const currentTime = window.performance.now();
    const dt = (currentTime - this.lastTime) / 1000; // delta time in seconds
    this.lastTime = currentTime;
    this.update(dt);
  }

  protected onLoaded(container: AssetContainer): void {
    // Optional hook for subclasses to do setup after loading
  }

  protected enableUpdate(): void {
    this._updateObserver = () => this._update();
    this.scene.onBeforeRenderObservable.add(this._updateObserver);

    this.lastTime = window.performance.now();
  }

  protected disableUpdate(): void {
    if (this._updateObserver) {
      this.scene.onBeforeRenderObservable.removeCallback(this._updateObserver);
      this._updateObserver = null;
    }
  }

  protected static async _Create<T extends Entity>(
    scene: Scene,
    EntityType: new (scene: Scene) => T
  ): Promise<T> {
    const entity = new EntityType(scene);
    const container = await LoadAssetContainerAsync(entity.modelPath, scene);
    container.addAllToScene();
    entity.container = container;

    entity.enableUpdate();
    entity.onLoaded(container);

    return entity;
  }
}
