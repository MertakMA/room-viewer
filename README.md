# room-viewer

Prohlídka modelu místnosti v prohlížeči. Do repa commituješ **STEP**,
GitHub Actions z něj udělá **GLB** a nasadí statický **three.js** viewer
na GitHub Pages. Žádný build krok, žádný node_modules.

```
model/room.step   ──►  Actions (OCCT)  ──►  web/model/room.glb  ──►  GitHub Pages
```

## Jak to zprovoznit

1. **Zapni Pages**: Settings → Pages → *Source: GitHub Actions*.
2. **Vlož model**: `model/room.step` → commit → push. Workflow se spustí sám.
   Jde i přes webové rozhraní GitHubu (*Add file → Upload files*).
3. Hotovo. Adresa je `https://<uživatel>.github.io/room-viewer/`.

STEP se commituje jako obyčejný binární soubor, ne přes Git LFS —
nahrávání přes web LFS pravidla ignoruje, takže by se obsah repa
rozcházel podle toho, odkud model přijde. Pro pár set kilobajtů na
revizi je prostý git v pohodě; kdyby modely narostly do desítek MB,
přejdi na LFS, ale pak už commituj výhradně z klienta s `git lfs`.

Dokud v `model/` žádný STEP není, viewer ukáže **ukázkovou místnost**,
takže stránka funguje hned po prvním nasazení.

## Export z Inventoru

File → Export → CAD Format → **STEP (AP214)**. AP214 přenese barvy
a názvy dílů, takže se v panelu *Části modelu* dá jednotlivě vypínat.

## Ovládání

| Režim **Model** | | **Procházka** | |
|---|---|---|---|
| levé tlačítko | otáčení | W A S D / šipky | pohyb |
| pravé tlačítko | posun | myš | rozhlížení |
| kolečko | přiblížení | Shift | běh |
| klik na podlahu | místo startu | F | létání / chůze |
| Enter | vstoupit dovnitř | Esc | zpět na model |

Na mobilu se v režimu procházky objeví joystick vlevo dole, rozhlížení
je tahem prstu.

Další funkce v pravém panelu: měřítko, **řez výškou** (odkrojí strop,
aby šlo nahlédnout dovnitř), výška očí, rychlost chůze, kolize se
stěnami, viditelnost jednotlivých částí, drátový model, stíny, půdorys,
snímek do PNG a **odkaz na konkrétní pohled** (uloží kameru do URL).

## Jednotky a orientace

Převod přes OCCT zapisuje glTF podle specifikace — **v metrech a s osou
Y nahoru** — takže model je po převodu srovnaný a viewer s ním nic
dalšího nedělá. Jednotky navíc pozná sám z velikosti modelu, takže si
poradí i s GLB z jiných nástrojů, které nechávají milimetry.

Kdyby model vyšel na boku nebo v nesmyslné velikosti, přepni
*Jednotky modelu* a *Orientace modelu* v panelu *Vzhled*; panel ti
rovnou vypíše, co zapsat do `web/js/config.js` (`defaultUnitScale`,
`defaultUpAxis`), ať to platí i pro ostatní.

Centimetry a palce se automaticky nehádají — velká hala v metrech
a malá místnost v centimetrech vycházejí stejně, takže se u nich
spoléhá na ruční volbu.

## Struktura

| cesta | co to je |
|---|---|
| `model/` | zdrojový STEP (a klidně i `.ipt` pro archiv) |
| `tools/step_to_glb.py` | převod STEP → GLB přes OCCT, záloha přes cadquery |
| `web/` | celý statický web, nasazuje se tak jak je |
| `web/js/scene.js` | scéna, světla, načtení modelu, řez, snímek |
| `web/js/walk.js` | chůze v první osobě, kolize, držení podlahy |
| `web/js/ui.js` | panel, joystick, seznam částí |
| `.github/workflows/deploy.yml` | převod + nasazení |

## Lokální vývoj

```bash
cd web && python3 -m http.server 8080
```
a otevři `http://localhost:8080`. Model si převedeš lokálně:

```bash
pip install -r tools/requirements.txt
python tools/step_to_glb.py model/room.step web/model/room.glb
```

## Ladění velikosti souboru

`--tolerance` je linearní tolerance triangulace v milimetrech. Výchozí
`0.5` je pro místnost bohatě dost. Když je GLB moc velký, zvyš ji
(`1.0`, `2.0`); když jsou kulaté tvary hranaté, sniž ji. Jde nastavit
i při ručním spuštění workflow (*Run workflow* → *tolerance*).

## Proč ne přímo .ipt

`.ipt` je uzavřený formát Autodesku. Na Linuxu ho nepřečte žádný
open-source nástroj — jedině placené Autodesk Platform Services
(Model Derivative API) nebo Windows runner s nainstalovaným Inventorem.
STEP je otevřený mezikrok, který zvládne OCCT zadarmo.
