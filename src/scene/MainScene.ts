import {
  CannonJSPlugin,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
} from "@babylonjs/core";

import "@babylonjs/core/Physics/physicsEngineComponent.js";
import "@babylonjs/core/Debug/debugLayer.js";
import "@babylonjs/inspector";

import * as CANNON from "cannon-es";

import { CameraFollow } from "../entities/CameraFollow.js";
import { Ground } from "../entities/Ground.js";
import { Player } from "../entities/Player.js";
import { InputSystem } from "../systems/InputSystem.js";

export class MainScene {
  scene: Scene;
  player!: Player;
  input: InputSystem;

  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.scene = new Scene(engine);
    this.scene.enablePhysics(
      new Vector3(0, -9.81, 0),
      new CannonJSPlugin(true, 10, CANNON),
    );
    this.scene.clearColor = new Color4(0.2, 0.2, 0.2); // Dark gray background

    const light = new HemisphericLight(
      "light",
      new Vector3(1, 1, 0),
      this.scene,
    );
    light.diffuse = new Color3(1, 1, 1);

    new Ground(this.scene);
    const camFollow = new CameraFollow(this.scene); //
    Player.Create(this.scene).then((player) => {
      this.player = player;
      camFollow.setPlayerMesh(player.mesh); //
    });

    this.input = new InputSystem(this.scene);
    InputSystem.current = this.input; // set the static current property

    // // create ArcRotateCamera
    // const camera = new ArcRotateCamera(
    //   "Camera",
    //   Math.PI / 2,
    //   Math.PI / 2,
    //   10,
    //   Vector3.Zero(),
    //   this.scene
    // );
    // camera.attachControl(canvas, true);
    // this.scene.activeCamera = camera;

    this.scene.activeCamera = camFollow.getCamera();

    window.addEventListener("keydown", (ev) => {
      // Shift+Ctrl+Alt+I
      if (
        ev.shiftKey &&
        ev.ctrlKey &&
        ev.altKey &&
        (ev.key === "I" || ev.key === "i")
      ) {
        if (this.scene.debugLayer.isVisible()) {
          this.scene.debugLayer.hide();
        } else {
          this.scene.debugLayer.show();
        }
      }
    });

    engine.runRenderLoop(() => {
      this.scene.render();
    });
  }
}
