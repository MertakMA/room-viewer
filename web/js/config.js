// Výchozí nastavení prohlížeče. Hodnoty jde přepsat i v URL, např.
//   index.html?units=0.001&up=z-&mode=walk
export const CONFIG = {
  // kde CI ukládá převedený model
  modelUrl: "./model/room.glb",

  // "auto" pozná metry i milimetry z velikosti modelu; jde zadat i číslo
  // (0.001 = milimetry, 1 = metry), pokud chceš mít jistotu.
  defaultUnitScale: "auto",

  // Která osa modelu míří nahoru: "z+", "z-", "y+", "y-".
  // OCCT zapisuje glTF podle specifikace s osou Y nahoru, takže převedený
  // model už je srovnaný. "z+"/"z-" je tu pro GLB z jiných nástrojů.
  defaultUpAxis: "y+",

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
