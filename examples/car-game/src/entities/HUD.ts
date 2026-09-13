// HUD.ts (New file or function)

import { Scene } from "@babylonjs/core/scene";
import { Car } from "./Car"; // Import your Car class
import * as GUI from "@babylonjs/gui";

export class HUD {
  private speedText!: GUI.TextBlock;
  private gearText!: GUI.TextBlock;
  private car!: Car;
  private adt: GUI.AdvancedDynamicTexture;

  constructor(private scene: Scene) {
    // Create the fullscreen canvas overlay
    this.adt = GUI.AdvancedDynamicTexture.CreateFullscreenUI(
      "HUD",
      true,
      scene
    );

    this.setupSpeedometer();
    this.setupGearIndicator();
  }

  setCar(car: Car) {
    this.car = car;

    // Register the update function to run every frame
    this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  private setupSpeedometer(): void {
    this.speedText = new GUI.TextBlock();
    this.speedText.name = "SpeedDisplay";
    this.speedText.text = "0 kph";
    this.speedText.color = "white";
    this.speedText.fontSize = 40;
    this.speedText.textHorizontalAlignment =
      GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.speedText.textVerticalAlignment =
      GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.speedText.paddingLeft = "5%";
    this.speedText.paddingBottom = "5%";

    this.adt.addControl(this.speedText);
  }

  private setupGearIndicator(): void {
    this.gearText = new GUI.TextBlock();
    this.gearText.name = "GearDisplay";
    this.gearText.text = "G: 1"; // Default to 1st gear
    this.gearText.color = "red";
    this.gearText.fontSize = 60;
    this.gearText.fontStyle = "bold";
    this.gearText.textHorizontalAlignment =
      GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.gearText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.gearText.paddingRight = "5%";
    this.gearText.paddingBottom = "5%";

    this.adt.addControl(this.gearText);
  }
  public update(): void {
    // --- 1. Update Speed ---
    // Convert m/s (this.car.Velocity) to km/h (multiply by 3.6)
    const speedKPH = Math.abs(this.car.Velocity * 3.6);
    this.speedText.text = `${Math.floor(speedKPH)} kph`;

    // --- 2. Update Gear ---
    // Assuming this.car.Gear will expose a number (1, 2, 3, etc.) or 'R'
    this.gearText.text = `G: ${this.car.Gear}`;

    // Optional: Change color for reverse
    if (this.car.Gear === "R") {
      this.gearText.color = "yellow";
    } else {
      this.gearText.color = "red";
    }
  }
}
