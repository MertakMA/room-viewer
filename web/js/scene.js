import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CONFIG } from "./config.js";
import { buildDemoRoom } from "./demo-room.js";

export class Viewer {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.background);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.02, 2000);
    this.camera.position.set(6, 4, 8);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.maxDistance = 400;
    this.controls.minDistance = 0.3;

    // osvětlení
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x4a4036, 1.1);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff2e0, 2.1);
    this.sun.position.set(8, 14, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // obsah
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.modelRoot = null;
    this.meshes = [];
    this.parts = [];
    this.bounds = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 3, 3));

    this.grid = new THREE.GridHelper(20, 20, 0x3a4350, 0x232a34);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    this.scene.add(this.grid);

    this.marker = this._buildMarker();
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    this.unitScale = CONFIG.defaultUnitScale;
    this.upAxis = CONFIG.defaultUpAxis;
    this.userScale = 1;
    this.isDemo = false;

    this._raycaster = new THREE.Raycaster();
    this._resize = this._resize.bind(this);
    window.addEventListener("resize", this._resize);
    this._resize();
  }

  /** Sklopení modelu podle toho, která jeho osa míří nahoru. */
  static upRotation(axis) {
    switch (axis) {
      case "z+": return -Math.PI / 2;   // STEP/Inventor, výchozí
      case "z-": return Math.PI / 2;    // Z míří dolů – model stojí na hlavě
      case "y-": return Math.PI;        // převrácené Y
      case "y+":
      default: return 0;                // už je v orientaci glTF
    }
  }

  _buildMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 36),
      new THREE.MeshBasicMaterial({ color: 0x4aa8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 999;
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.3, 16),
      new THREE.MeshBasicMaterial({ color: 0x4aa8ff, depthTest: false })
    );
    pin.position.y = 0.3;
    pin.rotation.x = Math.PI;
    pin.renderOrder = 999;
    g.add(ring, pin);
    return g;
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** Načte GLB; když neexistuje, postaví demo místnost. */
  async load(url, onProgress) {
    let root = null;
    try {
      const head = await fetch(url, { method: "HEAD" });
      if (!head.ok) throw new Error(String(head.status));
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url, (ev) => {
        if (onProgress && ev.lengthComputable) onProgress(ev.loaded / ev.total);
      });
      root = gltf.scene;
      this.isDemo = false;
    } catch {
      root = buildDemoRoom();
      this.isDemo = true;
    }

    if (this.modelRoot) this.modelGroup.remove(this.modelRoot);
    this.modelRoot = root;
    this.modelGroup.add(root);

    this.meshes = [];
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) { m.side = THREE.DoubleSide; m.shadowSide = THREE.DoubleSide; }
        }
        this.meshes.push(o);
      }
    });

    this.parts = this._collectParts(root);

    // Syrová velikost modelu, než na něj sáhneme měřítkem – podle ní
    // se pozná, jestli přišel v metrech, nebo v milimetrech.
    root.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(root);
    this.rawSize = raw.isEmpty() ? new THREE.Vector3(1, 1, 1) : raw.getSize(new THREE.Vector3());

    this.applyTransform();
    return { isDemo: this.isDemo, meshCount: this.meshes.length, parts: this.parts };
  }

  /** Najde nejmělčí úroveň, kde je víc než jeden potomek — to jsou „části“. */
  _collectParts(root) {
    let level = [root];
    let guard = 0;
    while (level.length === 1 && level[0].children.length > 0 && guard++ < 8) {
      level = level[0].children;
    }
    return level
      .filter((o) => o.children.length || o.isMesh)
      .slice(0, 80)
      .map((o, i) => ({ object: o, name: o.name && o.name.trim() ? o.name : `Část ${i + 1}` }));
  }

  /**
   * Odhadne jednotky z velikosti modelu. Místnost má v metrech jednotky
   * řádu jednotek až desítek; když vyjde tisíckrát víc, přišla v
   * milimetrech. OCCT zapisuje glTF podle specifikace v metrech, cesta
   * přes cadquery umí nechat milimetry – tohle pokryje obojí.
   */
  detectUnitScale() {
    const span = Math.max(this.rawSize?.x || 0, this.rawSize?.y || 0, this.rawSize?.z || 0);
    if (!span) return 1;
    if (span > 300) return 0.001;      // milimetry
    if (span < 0.05) return 1000;      // model přišel tisíckrát zmenšený
    return 1;                          // metry
    // Centimetry a palce schválně nehádám – velká hala v metrech a
    // malá místnost v centimetrech vycházejí stejně. Od toho je ruční volba.
  }

  get effectiveUnitScale() {
    return this.unitScale === "auto" ? this.detectUnitScale() : this.unitScale;
  }

  /** Použije jednotky, orientaci a uživatelské měřítko; podlahu srovná na y = 0. */
  applyTransform() {
    if (!this.modelRoot) return;
    const g = this.modelGroup;
    const s = this.isDemo ? this.userScale : this.effectiveUnitScale * this.userScale;
    g.position.set(0, 0, 0);
    g.rotation.set(this.isDemo ? 0 : Viewer.upRotation(this.upAxis), 0, 0);
    g.scale.setScalar(s);
    g.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    g.position.set(-c.x, -box.min.y, -c.z);
    g.updateMatrixWorld(true);

    this.bounds = new THREE.Box3().setFromObject(g);
    this._refreshHelpers();
  }

  _refreshHelpers() {
    const size = this.bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 1);
    const step = span > 40 ? 5 : span > 12 ? 1 : 0.5;
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    this.grid = new THREE.GridHelper(Math.ceil(span * 1.6), Math.ceil((span * 1.6) / step), 0x3a4350, 0x232a34);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.grid.position.y = -0.002;
    this.scene.add(this.grid);

    const r = Math.max(span, size.y) * 1.2 + 2;
    this.sun.position.set(r * 0.6, r * 1.1, r * 0.5);
    const cam = this.sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 0.1; cam.far = r * 4;
    cam.updateProjectionMatrix();

    // Near musí sedět na velikost scény, jinak malý model propadne
    // před ořezovou rovinu a zmizí, i když ho kamera míří přesně.
    this.camera.near = Math.max(0.005, Math.min(0.05, span / 400));
    this.camera.far = Math.max(2000, span * 20);
    this.camera.updateProjectionMatrix();
  }

  fitToModel(animate = true) {
    const size = this.bounds.getSize(new THREE.Vector3());
    const center = this.bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.5);
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 360) * 1.05;
    const dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
    this.setView(center.clone().add(dir.multiplyScalar(dist)), center, animate);
  }

  topView(animate = true) {
    const size = this.bounds.getSize(new THREE.Vector3());
    const center = this.bounds.getCenter(new THREE.Vector3());
    const dist = Math.max(size.x, size.z) * 1.25 + 2;
    this.setView(new THREE.Vector3(center.x, this.bounds.max.y + dist, center.z + 0.001), center, animate);
  }

  setView(position, target, animate = true) {
    if (!animate) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    const from = this.camera.position.clone();
    const fromT = this.controls.target.clone();
    const t0 = performance.now();
    const dur = 520;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(from, position, e);
      this.controls.target.lerpVectors(fromT, target, e);
      this.controls.update();
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  setClipHeight(height) {
    if (height === null) {
      this.renderer.clippingPlanes = [];
    } else {
      this.clipPlane.constant = height;
      this.renderer.clippingPlanes = [this.clipPlane];
    }
  }

  setWireframe(on) {
    for (const mesh of this.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) if (m) m.wireframe = on;
    }
  }

  setGrid(on) { this.grid.visible = on; }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    for (const mesh of this.meshes) mesh.material && (mesh.material.needsUpdate = true);
  }

  setMarker(point) {
    if (!point) { this.marker.visible = false; return; }
    this.marker.position.copy(point);
    this.marker.visible = true;
  }

  /** Vrátí bod na modelu pod kurzorem (NDC souřadnice). */
  pick(ndcX, ndcY) {
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hits = this._raycaster.intersectObjects(this.meshes, false);
    return hits.length ? hits[0] : null;
  }

  screenshot(filename = "mistnost.png") {
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
