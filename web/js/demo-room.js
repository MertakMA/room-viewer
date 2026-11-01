import * as THREE from "three";

/**
 * Procedurální demo místnost (v metrech, osa Y nahoru).
 * Použije se, dokud ve web/model/ není skutečný room.glb — díky tomu
 * je stránka funkční hned po prvním nasazení na Pages.
 */
export function buildDemoRoom() {
  const room = new THREE.Group();
  room.name = "Demo místnost";

  const W = 6.0;   // šířka
  const D = 4.4;   // hloubka
  const H = 2.75;  // světlá výška
  const T = 0.15;  // tloušťka stěny

  const mat = (color, roughness = 0.85, metalness = 0.0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const floorMat = mat(0x8a7357, 0.78);
  const wallMat = mat(0xd8d4cc, 0.95);
  const ceilMat = mat(0xf2f1ee, 0.95);
  const woodMat = mat(0x6b4f35, 0.6);
  const fabricMat = mat(0x3f5c76, 0.95);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe0ff, roughness: 0.08, metalness: 0, transmission: 0.85,
    thickness: 0.02, transparent: true, opacity: 0.35,
  });

  const box = (w, h, d, material, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    room.add(m);
    return m;
  };

  box(W, T, D, floorMat, 0, -T / 2, 0, "Podlaha");
  box(W, T, D, ceilMat, 0, H + T / 2, 0, "Strop");

  // zadní stěna s oknem
  const backLeft = (W - 2.2) / 2;
  box(backLeft, H, T, wallMat, -(W - backLeft) / 2, H / 2, -D / 2, "Stěna sever A");
  box(backLeft, H, T, wallMat, (W - backLeft) / 2, H / 2, -D / 2, "Stěna sever B");
  box(2.2, 0.95, T, wallMat, 0, 0.475, -D / 2, "Parapet");
  box(2.2, H - 0.95 - 1.5, T, wallMat, 0, H - (H - 0.95 - 1.5) / 2, -D / 2, "Nadpraží okna");
  box(2.1, 1.45, 0.03, glassMat, 0, 0.95 + 0.725, -D / 2, "Okno");

  // přední stěna s dveřmi
  const doorW = 0.95, doorH = 2.05;
  const frontSide = (W - doorW) / 2;
  box(frontSide, H, T, wallMat, -(W - frontSide) / 2, H / 2, D / 2, "Stěna jih A");
  box(frontSide, H, T, wallMat, (W - frontSide) / 2, H / 2, D / 2, "Stěna jih B");
  box(doorW, H - doorH, T, wallMat, 0, doorH + (H - doorH) / 2, D / 2, "Nadpraží dveří");

  // boční stěny
  box(T, H, D, wallMat, -W / 2, H / 2, 0, "Stěna západ");
  box(T, H, D, wallMat, W / 2, H / 2, 0, "Stěna východ");

  // nábytek
  const table = new THREE.Group();
  table.name = "Stůl";
  const tTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.85), woodMat);
  tTop.position.y = 0.73; tTop.castShadow = true; tTop.receiveShadow = true;
  table.add(tTop);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), woodMat);
    leg.position.set(sx * 0.72, 0.36, sz * 0.36);
    leg.castShadow = true;
    table.add(leg);
  }
  table.position.set(-1.0, 0, 0.4);
  room.add(table);

  const sofa = new THREE.Group();
  sofa.name = "Pohovka";
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.42, 0.85), fabricMat);
  seat.position.y = 0.21;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.22), fabricMat);
  back.position.set(0, 0.48, -0.32);
  for (const m of [seat, back]) { m.castShadow = true; m.receiveShadow = true; sofa.add(m); }
  sofa.position.set(1.6, 0, -1.2);
  sofa.rotation.y = Math.PI;
  room.add(sofa);

  const shelf = new THREE.Group();
  shelf.name = "Regál";
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.32), woodMat);
    s.position.y = 0.35 + i * 0.45;
    s.castShadow = true; s.receiveShadow = true;
    shelf.add(s);
  }
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.85, 0.32), woodMat);
  sideA.position.set(-0.45, 0.92, 0);
  const sideB = sideA.clone(); sideB.position.x = 0.45;
  shelf.add(sideA, sideB);
  shelf.position.set(-2.4, 0, -1.9);
  room.add(shelf);

  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.2, 20),
    new THREE.MeshStandardMaterial({ color: 0xfff3dd, emissive: 0xffdca8, emissiveIntensity: 0.6 })
  );
  lamp.position.set(0, H - 0.25, 0);
  lamp.name = "Svítidlo";
  room.add(lamp);

  return room;
}
