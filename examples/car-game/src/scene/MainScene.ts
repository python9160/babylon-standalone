import { CannonJSPlugin } from "@babylonjs/core/Physics/Plugins/cannonJSPlugin";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

import * as CANNON from "cannon-es";
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";

import { Ground } from "../entities/Ground";
import { InputSystem } from "../systems/InputSystem";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

import { Car } from "../entities/Car";
import { CubeTexture } from "@babylonjs/core";
import { R } from "../engine/R";
import { HUD } from "../entities/HUD";
import { CamFollow } from "../entities/CamFollow";

export class MainScene {
  scene: Scene;
  input: InputSystem;
  hud: HUD;
  camera: CamFollow;

  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.scene = new Scene(engine);
    this.scene.enablePhysics(
      new Vector3(0, -9.81, 0),
      new CannonJSPlugin(true, 10, CANNON)
    );

    const b64faces = ["pxbmp", "pybmp", "pzbmp", "nxbmp", "nybmp", "nzbmp"].map(
      (face) => R.textures.day[face as keyof typeof R.textures.day]()
    );

    const skyboxTexture = CubeTexture.CreateFromImages(b64faces, this.scene);
    this.scene.createDefaultSkybox(skyboxTexture, true, 1000, 0.0, false);
    this.scene.environmentTexture = skyboxTexture;

    const light = new HemisphericLight(
      "light",
      new Vector3(1, 1, 0),
      this.scene
    );
    light.diffuse = new Color3(1, 1, 1);

    // create ArcRotateCamera
    this.camera = new CamFollow(this.scene, canvas);
    this.scene.activeCamera = this.camera.camera;

    this.hud = new HUD(this.scene);

    this.initializeScene();

    this.input = new InputSystem(this.scene);
    InputSystem.current = this.input; // set the static current property
    InputSystem.enableGlobalUpdate(this.scene);

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

  async initializeScene(): Promise<void> {
    try {
      const car = await Car.Create(this.scene);

      // Operations that depend ONLY on the Car
      this.hud.setCar(car);
      this.camera.setCar(car);

      // This is guaranteed to start only AFTER the Car promise resolves
      const ground = await Ground.Create(this.scene);

      // Operations that depend on BOTH models
      car.goToPos(ground.GridPositions[0]);
    } catch (error) {
      // Handle any error that occurs during either Car.Create or Ground.Create
      console.error("Failed to initialize scene sequentially:", error);
    }
  }
}
