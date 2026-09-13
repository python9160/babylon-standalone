import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PhysicsImpostor } from "@babylonjs/core/Physics/physicsImpostor";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Space } from "@babylonjs/core/Maths/math.axis";

import { R } from "../engine/R";
import { Entity } from "../engine/Entity";
import { Base64String } from "../../types/global";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

export class Ground extends Entity {
  public get GridPositions() {
    return this.gridPositions;
  }
  private gridPositions: TransformNode[] = [];

  protected get modelPath(): Base64String {
    return R.models.trackglb();
  }

  protected update(dt: number): void {}

  protected onLoaded(container: AssetContainer): void {
    this.disableUpdate();

    // double mesh size
    container.rootNodes.forEach((node) => {
      if (node instanceof TransformNode) {
        node.scaling = new Vector3(2.5, 2.5, 2.5);
      }
    });

    // find node named Grid and store its children as grid positions
    const gridNode = container.transformNodes.find(
      (node) => node.name === "Grid"
    );
    if (gridNode) {
      this.gridPositions = gridNode
        .getChildren()
        .map((child) => child as TransformNode);
    }
    console.log(
      `Found ${this.gridPositions.length} grid positions for ground. ${
        gridNode ? "Found" : "Did not find"
      } grid node.`
    );
  }

  public static async Create(scene: Scene): Promise<Ground> {
    return Entity._Create<Ground>(scene, Ground);
  }
}
