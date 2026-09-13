import { Nullable, Observable } from "@babylonjs/core";
import { ActionManager } from "@babylonjs/core/Actions/actionManager";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions";
import { Scene } from "@babylonjs/core/scene";

export class InputSystem {
  private static _current: InputSystem | null = null;

  private static _updateObserver: Nullable<() => void> = null;
  private lastTime: number = window.performance.now();

  public static Throttle = 0;
  public static Steer = 0;
  public static Brake = 0;
  public static Handbrake = false;
  public static SteerMaxTime = 0;

  public static onShiftUp: Observable<void> = new Observable<void>();
  public static onShiftDown: Observable<void> = new Observable<void>();

  private readonly smoothT: number = 5;
  private readonly smoothS: number = 5;
  private readonly smoothB: number = 10;

  private update() {
    const currentTime = window.performance.now();
    const dt = (currentTime - this.lastTime) / 1000; // delta time in seconds
    this.lastTime = currentTime;

    let rawTargetT = this.inputMap["w"] ? 1.0 : 0.0;
    let rawTargetB = this.inputMap["s"] ? 1.0 : 0.0;

    let rawTargetS = 0;
    if (this.inputMap["d"]) {
      rawTargetS += 1.0;
    }
    if (this.inputMap["a"]) {
      rawTargetS -= 1.0;
    }

    const before = Math.abs(InputSystem.Steer) > 0.9;
    InputSystem.Steer = this.lerp(
      InputSystem.Steer,
      rawTargetS,
      this.smoothS,
      dt
    );
    const after = Math.abs(InputSystem.Steer) > 0.9;

    if (before && !after) {
      InputSystem.SteerMaxTime = 0;
    } else if (after) {
      InputSystem.SteerMaxTime += dt;
    }

    InputSystem.Throttle = this.lerp(
      InputSystem.Throttle,
      rawTargetT,
      this.smoothT,
      dt
    );

    InputSystem.Brake = this.lerp(
      InputSystem.Brake,
      rawTargetB,
      this.smoothB,
      dt
    );

    InputSystem.Handbrake = this.inputMap[" "];
  }

  private lerp(
    current: number,
    target: number,
    rate: number,
    dt: number
  ): number {
    const difference = target - current;
    const maxChange = rate * dt;

    if (Math.abs(difference) > maxChange) {
      return current + Math.sign(difference) * maxChange;
    }
    // If close enough, just snap to the target to avoid tiny floating point creep
    return target;
  }

  public static enableGlobalUpdate(scene: Scene) {
    if (InputSystem._updateObserver) {
      // already enabled
      return;
    }

    this._updateObserver = () => this.current.update();
    scene.onBeforeRenderObservable.add(this._updateObserver);
  }

  public static disableGlobalUpdate(scene: Scene) {
    if (InputSystem._updateObserver) {
      scene.onBeforeRenderObservable.removeCallback(
        InputSystem._updateObserver
      );
    }
  }

  public static get current(): InputSystem {
    if (!InputSystem._current) {
      throw new Error("InputSystem has not been initialized.");
    }
    return InputSystem._current;
  }

  public static get inputMap(): { [key: string]: boolean } {
    return InputSystem.current.inputMap;
  }

  public static set current(input: InputSystem) {
    InputSystem._current = input;
  }

  public inputMap: { [key: string]: boolean } = {};

  constructor(scene: Scene) {
    scene.actionManager = new ActionManager(scene);

    scene.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, (evt) => {
        this.inputMap[evt.sourceEvent.key] = true;
        if (evt.sourceEvent.key === "ArrowUp")
          InputSystem.onShiftUp.notifyObservers();
        if (evt.sourceEvent.key === "ArrowDown")
          InputSystem.onShiftDown.notifyObservers();
      })
    );

    scene.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnKeyUpTrigger,
        (evt) => (this.inputMap[evt.sourceEvent.key] = false)
      )
    );
  }
}
