import * as THREE from "three";
import { CONFIG } from "./config.js";

/**
 * Pohyb v první osobě: myš + WASD/šipky na počítači, joystick + tah
 * prstem na dotykových zařízeních. Kolize i držení podlahy řeší raycast
 * proti síti modelu, takže funguje na libovolném načteném modelu.
 */
export class WalkController {
  constructor(viewer) {
    this.viewer = viewer;
    this.camera = viewer.camera;
    this.dom = viewer.renderer.domElement;

    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
    this.velocityY = 0;
    this.flying = false;

    this.eyeHeight = CONFIG.eyeHeight;
    this.speed = CONFIG.walkSpeed;
    this.collide = true;
    this.followFloor = true;

    this.keys = new Set();
    this.touchMove = { x: 0, y: 0 };

    this._ray = new THREE.Raycaster();
    this._down = new THREE.Vector3(0, -1, 0);
    this._tmp = new THREE.Vector3();

    this.onLockChange = null; // callback(boolean)

    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (e.code === "KeyF") this.flying = !this.flying;
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * CONFIG.lookSensitivity;
      this.pitch -= e.movementY * CONFIG.lookSensitivity;
      this._clampPitch();
    };
    this._onLockChange = () => {
      const locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(locked);
    };
    this._onCanvasClick = () => {
      if (this.enabled && !this._isTouch() && document.pointerLockElement !== this.dom) {
        this._requestLock();
      }
    };

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("pointerlockchange", this._onLockChange);
    this.dom.addEventListener("click", this._onCanvasClick);

    // dotykové rozhlížení (tah kdekoli mimo joystick)
    let lastTouch = null;
    this.dom.addEventListener("touchstart", (e) => {
      if (!this.enabled) return;
      lastTouch = e.touches[0];
    }, { passive: true });
    this.dom.addEventListener("touchmove", (e) => {
      if (!this.enabled || !lastTouch) return;
      const t = e.touches[0];
      this.yaw -= (t.clientX - lastTouch.clientX) * 0.005;
      this.pitch -= (t.clientY - lastTouch.clientY) * 0.005;
      this._clampPitch();
      lastTouch = t;
    }, { passive: true });
    this.dom.addEventListener("touchend", () => { lastTouch = null; }, { passive: true });
  }

  /** Pointer lock jde vyžádat jen z gesta uživatele – selhání je v pořádku. */
  _requestLock() {
    try {
      const r = this.dom.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch { /* prohlížeč gesto neuznal */ }
  }

  _isTouch() {
    return window.matchMedia("(pointer: coarse)").matches;
  }

  _clampPitch() {
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  /** Spustí režim chůze na daném bodě (podlahové souřadnice). */
  enable(spawn) {
    this.enabled = true;
    this.flying = false;
    this.velocityY = 0;
    this.keys.clear();

    const p = spawn ? spawn.clone() : this._defaultSpawn();
    this.camera.position.set(p.x, p.y + this.eyeHeight, p.z);

    // natoč se do středu modelu
    const center = this.viewer.bounds.getCenter(new THREE.Vector3());
    const dir = this._tmp.set(center.x - p.x, 0, center.z - p.z);
    this.yaw = dir.lengthSq() > 0.01 ? Math.atan2(-dir.x, -dir.z) : 0;
    this.pitch = 0;
    this._apply();

    if (!this._isTouch()) this._requestLock();
  }

  disable() {
    this.enabled = false;
    this.keys.clear();
    this.touchMove.x = this.touchMove.y = 0;
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.();
  }

  _defaultSpawn() {
    const b = this.viewer.bounds;
    const c = b.getCenter(new THREE.Vector3());
    return new THREE.Vector3(c.x, b.min.y, c.z);
  }

  _apply() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  /** Posune se o delta, pokud tam nic nepřekáží. */
  _tryMove(axisVec, distance) {
    if (Math.abs(distance) < 1e-6) return;
    const dir = axisVec.clone().multiplyScalar(Math.sign(distance));
    if (this.collide && this.viewer.meshes.length) {
      const origin = this.camera.position.clone();
      origin.y -= this.eyeHeight * 0.45; // měř zhruba v pase, ne u stropu
      this._ray.set(origin, dir);
      this._ray.far = Math.abs(distance) + CONFIG.bodyRadius;
      const hit = this._ray.intersectObjects(this.viewer.meshes, false)[0];
      if (hit && hit.distance < Math.abs(distance) + CONFIG.bodyRadius) return;
    }
    this.camera.position.addScaledVector(axisVec, distance);
  }

  update(dt) {
    if (!this.enabled) return;
    this._apply();

    const k = this.keys;
    let fwd = 0, side = 0, up = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) side += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) side -= 1;
    if (k.has("Space")) up += 1;
    if (k.has("ShiftLeft") || k.has("ShiftRight")) { /* běh řešen níž */ }
    if (k.has("KeyQ")) up -= 1;
    if (k.has("KeyE")) up += 1;

    fwd += this.touchMove.y;
    side += this.touchMove.x;

    const running = k.has("ShiftLeft") || k.has("ShiftRight");
    const v = this.speed * (running ? CONFIG.runMultiplier : 1) * dt;

    if (fwd || side) {
      const len = Math.hypot(fwd, side) || 1;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (this.flying) {
        forward.set(0, 0, -1).applyEuler(this.camera.rotation);
        right.set(1, 0, 0).applyEuler(this.camera.rotation);
      }
      this._tryMove(forward, (fwd / len) * v);
      this._tryMove(right, (side / len) * v);
    }

    if (this.flying || !this.followFloor) {
      if (up) this.camera.position.y += up * v;
      return;
    }

    // držení podlahy – paprsek dolů z výšky kroku nad očima
    if (this.viewer.meshes.length) {
      const origin = this._tmp.copy(this.camera.position);
      origin.y += CONFIG.stepHeight;
      this._ray.set(origin, this._down);
      this._ray.far = CONFIG.stepHeight + this.eyeHeight + 6;
      const hit = this._ray.intersectObjects(this.viewer.meshes, false)[0];
      if (hit) {
        const target = hit.point.y + this.eyeHeight;
        this.camera.position.y += (target - this.camera.position.y) * Math.min(1, dt * 12);
        return;
      }
    }
    const floor = this.viewer.bounds.min.y + this.eyeHeight;
    this.camera.position.y += (floor - this.camera.position.y) * Math.min(1, dt * 8);
  }
}
