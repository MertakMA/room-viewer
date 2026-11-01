const $ = (id) => document.getElementById(id);

export function toast(message, ms = 2200) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

const fmt = (n, d = 2) => n.toFixed(d).replace(".", ",");

export function bindUI(app) {
  const { viewer, walk } = app;

  // ---- panel ----
  $("panel-toggle").addEventListener("click", () => {
    $("panel").classList.toggle("open");
  });

  // ---- režimy ----
  $("btn-orbit").addEventListener("click", () => app.setMode("orbit"));
  $("btn-walk").addEventListener("click", () => app.setMode("walk"));

  // ---- měřítko ----
  const scaleIn = $("in-scale");
  const applyScale = () => {
    const s = Math.pow(10, parseFloat(scaleIn.value));
    viewer.userScale = s;
    viewer.applyTransform();
    $("out-scale").textContent = `${fmt(s)}×`;
    app.updateClipRange();
  };
  scaleIn.addEventListener("input", applyScale);
  scaleIn.addEventListener("dblclick", () => { scaleIn.value = "0"; applyScale(); });

  $("btn-fit").addEventListener("click", () => {
    app.setMode("orbit");
    viewer.fitToModel();
  });
  $("btn-top").addEventListener("click", () => {
    app.setMode("orbit");
    viewer.topView();
  });

  // ---- řez ----
  const clipIn = $("in-clip");
  const applyClip = () => {
    const pct = parseFloat(clipIn.value);
    if (pct >= 100) {
      viewer.setClipHeight(null);
      $("out-clip").textContent = "vypnuto";
    } else {
      const b = viewer.bounds;
      const h = b.min.y + ((b.max.y - b.min.y) * pct) / 100;
      viewer.setClipHeight(h);
      $("out-clip").textContent = `${fmt(h)} m`;
    }
  };
  clipIn.addEventListener("input", applyClip);
  app.applyClip = applyClip;

  // ---- chůze ----
  const eyeIn = $("in-eye");
  eyeIn.addEventListener("input", () => {
    walk.eyeHeight = parseFloat(eyeIn.value);
    $("out-eye").textContent = `${fmt(walk.eyeHeight)} m`;
  });
  const speedIn = $("in-speed");
  speedIn.addEventListener("input", () => {
    walk.speed = parseFloat(speedIn.value);
    $("out-speed").textContent = `${fmt(walk.speed, 1)} m/s`;
  });
  $("in-collide").addEventListener("change", (e) => { walk.collide = e.target.checked; });
  $("in-gravity").addEventListener("change", (e) => { walk.followFloor = e.target.checked; });

  // ---- vzhled ----
  $("in-grid").addEventListener("change", (e) => viewer.setGrid(e.target.checked));
  $("in-wire").addEventListener("change", (e) => viewer.setWireframe(e.target.checked));
  $("in-shadow").addEventListener("change", (e) => viewer.setShadows(e.target.checked));
  $("in-units").addEventListener("change", (e) => {
    viewer.unitScale = parseFloat(e.target.value);
    viewer.applyTransform();
    viewer.fitToModel();
    app.updateClipRange();
    app.updateMeta();
  });
  $("in-zup").addEventListener("change", (e) => {
    viewer.zUp = e.target.checked;
    viewer.applyTransform();
    viewer.fitToModel();
    app.updateClipRange();
    app.updateMeta();
  });

  // ---- sdílení a snímek ----
  $("btn-share").addEventListener("click", async () => {
    const url = app.buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast("Odkaz na tento pohled zkopírován");
    } catch {
      location.hash = new URL(url).hash;
      toast("Odkaz je v adresním řádku");
    }
  });
  $("btn-shot").addEventListener("click", () => {
    viewer.screenshot("mistnost.png");
    toast("Snímek uložen");
  });

  // ---- nápověda ----
  $("help-toggle").addEventListener("click", () => $("help").classList.remove("hidden"));
  $("help-close").addEventListener("click", () => $("help").classList.add("hidden"));
  $("help").addEventListener("click", (e) => {
    if (e.target.id === "help") $("help").classList.add("hidden");
  });

  // ---- joystick ----
  bindJoystick(walk);

  return {
    setParts(parts) {
      const box = $("parts");
      box.innerHTML = "";
      if (!parts.length) {
        box.innerHTML = '<p class="hint">Model nemá pojmenované části.</p>';
        return;
      }
      for (const part of parts) {
        const row = document.createElement("label");
        row.className = "part";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = part.object.visible;
        cb.addEventListener("change", () => { part.object.visible = cb.checked; });
        const name = document.createElement("span");
        name.textContent = part.name;
        name.title = part.name;
        row.append(cb, name);
        box.appendChild(row);
      }
    },
    syncControls() {
      $("out-scale").textContent = `${fmt(viewer.userScale)}×`;
      $("out-eye").textContent = `${fmt(walk.eyeHeight)} m`;
      $("out-speed").textContent = `${fmt(walk.speed, 1)} m/s`;
      $("in-units").value = String(viewer.unitScale);
      $("in-zup").checked = viewer.zUp;
      $("in-scale").value = String(Math.log10(viewer.userScale));
      applyClip();
    },
  };
}

function bindJoystick(walk) {
  const pad = document.getElementById("joystick");
  const knob = document.getElementById("joystick-knob");
  const R = 33;
  let active = null;

  const set = (dx, dy) => {
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    const x = dx * k, y = dy * k;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    walk.touchMove.x = x / R;
    walk.touchMove.y = -y / R;
  };

  pad.addEventListener("pointerdown", (e) => {
    active = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    const r = pad.getBoundingClientRect();
    set(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    e.preventDefault();
  });
  pad.addEventListener("pointermove", (e) => {
    if (active !== e.pointerId) return;
    const r = pad.getBoundingClientRect();
    set(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  });
  const stop = (e) => {
    if (active !== e.pointerId) return;
    active = null;
    knob.style.transform = "";
    walk.touchMove.x = walk.touchMove.y = 0;
  };
  pad.addEventListener("pointerup", stop);
  pad.addEventListener("pointercancel", stop);
}
