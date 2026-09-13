import {
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Color3,
  PhysicsImpostor,
  Vector3,
  Space,
} from "@babylonjs/core";

import { R } from "../engine/R.js";

export class Ground {
  constructor(scene: Scene) {
    const ground = MeshBuilder.CreateBox(
      "ground",
      {
        width: 100,
        height: 2, // this is your thickness!
        depth: 100,
      },
      scene,
    );

    ground.position.y = -1; // half the thickness, so top sits at y = 0

    const groundMat = new StandardMaterial("groundMat", scene);
    const texture = new Texture(R.textures.checkerboardjpeg(), scene);
    texture.uScale = 20;
    texture.vScale = 20;

    groundMat.diffuseTexture = texture;
    groundMat.diffuseColor = new Color3(1, 1, 1); // White color
    ground.material = groundMat;

    ground.physicsImpostor = new PhysicsImpostor(
      ground,
      PhysicsImpostor.BoxImpostor,
      { mass: 0 },
      scene,
    );

    // create a 10x10x2 box for the player to jump onto
    const collider = MeshBuilder.CreateBox(
      "groundCollider",
      { width: 10, height: 2, depth: 10 },
      scene,
    );

    collider.material = groundMat; // use the same material
    collider.physicsImpostor = new PhysicsImpostor(
      collider,
      PhysicsImpostor.BoxImpostor,
      { mass: 0 },
      scene,
    );

    collider.rotate(new Vector3(1, 0, 0), 0.1, Space.WORLD); // rotate slightly to avoid immediate collision
    collider.position.y = 8; // half the thickness, so top sits at y = 2
    collider.position.x = 7;
  }
}
