# Sem patří model

Vlož do této složky jeden soubor `.step` nebo `.stp` — například `room.step`.
Workflow vezme abecedně první a převede ho na `web/model/room.glb`.

## Export z Inventoru

1. Otevři sestavu nebo díl.
2. **File → Export → CAD Format**, typ **STEP Files (*.stp, *.step)**.
3. V **Options** nastav **Application Protocol: AP214** (nese barvy a názvy dílů).
4. Ulož sem a commitni.

`.ipt` si sem klidně commituj taky jako zdroj pravdy — převod z něj
běžet nebude (Inventor formát umí přečíst jen Inventor nebo placené
Autodesk Platform Services), ale STEP vedle něj drží historii pohromadě.
