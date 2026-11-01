// Výchozí nastavení prohlížeče. Hodnoty jde přepsat i v URL, např.
//   index.html?units=0.001&zup=1&mode=walk
export const CONFIG = {
  // kde CI ukládá převedený model
  modelUrl: "./model/room.glb",

  // 0.001 = model je v milimetrech (typický STEP z Inventoru)
  defaultUnitScale: 0.001,

  // STEP/Inventor má obvykle osu Z nahoru, glTF a three.js Y nahoru
  defaultZUp: true,

  // chůze
  eyeHeight: 1.65,     // m
  walkSpeed: 3.0,      // m/s
  runMultiplier: 2.4,
  bodyRadius: 0.35,    // m – poloměr pro kolize
  stepHeight: 0.45,    // m – jak vysoký schod zvládne
  lookSensitivity: 0.0022,

  // vzhled
  background: 0x11151b,
  maxPixelRatio: 2,
};
