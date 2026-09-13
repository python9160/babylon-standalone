// <reference types="../../types/global.d.ts" />

import { Engine } from "@babylonjs/core";
import { MainScene } from "../scene/MainScene.js";
import "@babylonjs/core/Culling/ray.js";
import "@babylonjs/core/Collisions/collisionCoordinator.js";

export class Game {
  constructor() {
    const canvas = document.createElement("canvas");
    canvas.id = "gameCanvas";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    document.body.appendChild(canvas);

    const engine = new Engine(canvas, true);
    new MainScene(engine, canvas);
  }
}

new Game();
