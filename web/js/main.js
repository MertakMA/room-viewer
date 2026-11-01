import * as THREE from "three";
import { CONFIG } from "./config.js";
import { Viewer } from "./scene.js";
import { WalkController } from "./walk.js";
import { bindUI, toast } from "./ui.js";

class App {
  constructor() {
    this.viewer = new Viewer(document.getElementById("viewport"));
    this.walk = new WalkController(this.viewer);
    this.mode = "orbit";
    this.spawn = null;
    this.clock = new THREE.Clock();
    this.ui = bindUI(this);

    this.walk.onLockChange = (locked) => {
      const hint = document.getElementById("lock-hint");
      hint.classList.toggle("hidden", locked || this.mode !== "walk");
    };
  }

  async start() {
    const params = new URLSearchParams(location.search);
    if (params.has("units")) this.viewer.unitScale = parseFloat(params.get("units"));
    if (params.has("zup")) this.viewer.zUp = params.get("zup") !== "0";

    const bar = document.getElementById("loader-bar");
    const info = await this.viewer.load(CONFIG.modelUrl, (p) => {
      bar.style.width = `${Math.round(p * 100)}%`;
    });
    bar.style.width = "100%";

    if (info.isDemo) {
      document.getElementById("model-title").textContent = "Ukázková místnost";
      toast("Model room.glb zatím není nasazený — ukazuji demo místnost.", 5200);
    }

    this.ui.setParts(info.parts);
    this.viewer.fitToModel(false);
    this.updateClipRange();
    this.updateMeta();
    this.ui.syncControls();
    this.readHash();

    document.getElementById("loader").classList.add("hidden");

    this.bindPicking();
    this.viewer.renderer.setAnimationLoop(() => this.frame());
  }

  updateMeta() {
    const s = this.viewer.bounds.getSize(new THREE.Vector3());
    const f = (n) => n.toFixed(2).replace(".", ",");
    document.getElementById("model-meta").textContent =
      `${f(s.x)} × ${f(s.z)} m · výška ${f(s.y)} m`;
  }

  updateClipRange() {
    if (this.applyClip) this.applyClip();
  }

  bindPicking() {
    const dom = this.viewer.renderer.domElement;
    let downAt = null;
    dom.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
    dom.addEventListener("pointerup", (e) => {
      if (this.mode !== "orbit" || !downAt) return;
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      const r = dom.getBoundingClientRect();
      const hit = this.viewer.pick(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
      if (!hit) return;
      const isFloorish = !hit.face || Math.abs(hit.face.normal.y) > 0.5 ||
        hit.point.y < this.viewer.bounds.min.y + 0.4;
      if (!isFloorish) return;
      this.spawn = hit.point.clone();
      this.viewer.setMarker(this.spawn);
      document.getElementById("spawn-hint").innerHTML =
        "Místo startu je nastavené. Stiskni <b>Enter</b> nebo <b>Procházka</b>.";
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "Enter" && this.mode === "orbit") this.setMode("walk");
      if (e.code === "Escape" && this.mode === "walk") this.setMode("orbit");
    });
  }

  setMode(mode) {
    if (mode === this.mode) {
      if (mode === "walk" && document.pointerLockElement === null) this.walk.enable(this.spawn);
      return;
    }
    this.mode = mode;

    const orbit = mode === "orbit";
    document.getElementById("btn-orbit").classList.toggle("active", orbit);
    document.getElementById("btn-walk").classList.toggle("active", !orbit);
    document.getElementById("btn-orbit").setAttribute("aria-selected", String(orbit));
    document.getElementById("btn-walk").setAttribute("aria-selected", String(!orbit));
    document.getElementById("crosshair").classList.toggle("hidden", orbit);
    document.getElementById("joystick").classList.toggle(
      "hidden", orbit || !window.matchMedia("(pointer: coarse)").matches
    );
    document.getElementById("lock-hint").classList.toggle("hidden", orbit);

    if (orbit) {
      this.walk.disable();
      this.viewer.controls.enabled = true;
      this.viewer.controls.target.copy(
        this.viewer.camera.position.clone().add(
          new THREE.Vector3(0, 0, -3).applyEuler(this.viewer.camera.rotation)
        )
      );
      this.viewer.controls.update();
      this.viewer.marker.visible = !!this.spawn;
    } else {
      this.viewer.controls.enabled = false;
      this.viewer.marker.visible = false;
      this.walk.enable(this.spawn);
    }
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.mode === "walk") this.walk.update(dt);
    else this.viewer.controls.update();
    this.viewer.render();
  }

  // ---- sdílení pohledu ----
  buildShareUrl() {
    const v = this.viewer;
    const p = v.camera.position;
    const t = v.controls.target;
    const r = (n) => Math.round(n * 1000) / 1000;
    const parts = [
      `m=${this.mode}`,
      `p=${r(p.x)},${r(p.y)},${r(p.z)}`,
      `t=${r(t.x)},${r(t.y)},${r(t.z)}`,
      `s=${r(v.userScale)}`,
      `u=${v.unitScale}`,
      `z=${v.zUp ? 1 : 0}`,
    ];
    if (this.spawn) parts.push(`w=${r(this.spawn.x)},${r(this.spawn.y)},${r(this.spawn.z)}`);
    const url = new URL(location.href);
    url.hash = parts.join("&");
    return url.toString();
  }

  readHash() {
    if (!location.hash || location.hash.length < 3) return;
    const q = new URLSearchParams(location.hash.slice(1));
    const vec = (key) => {
      const raw = q.get(key);
      if (!raw) return null;
      const n = raw.split(",").map(Number);
      return n.length === 3 && n.every(Number.isFinite) ? new THREE.Vector3(...n) : null;
    };
    const v = this.viewer;

    if (q.has("u")) v.unitScale = parseFloat(q.get("u"));
    if (q.has("z")) v.zUp = q.get("z") === "1";
    if (q.has("s")) v.userScale = parseFloat(q.get("s")) || 1;
    v.applyTransform();

    const spawn = vec("w");
    if (spawn) { this.spawn = spawn; v.setMarker(spawn); }

    const pos = vec("p");
    const tgt = vec("t");
    if (pos && tgt) v.setView(pos, tgt, false);

    this.ui.syncControls();
    if (q.get("m") === "walk") this.setMode("walk");
  }
}

const app = new App();
app.start().catch((err) => {
  console.error(err);
  document.getElementById("loader-text").textContent = `Model se nepodařilo načíst: ${err.message}`;
});
