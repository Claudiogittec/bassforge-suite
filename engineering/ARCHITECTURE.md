# BassForge SUITE — Mapa Arquitetural, Contratos e Módulos

> **Arquitetura**: Fontes modulares SRP em [`src/`](../src) compiladas pelo montador zero-dependência [`scripts/build.js`](../scripts/build.js) nos artefatos standalone 100% offline [`index.html`](../index.html) (`file://`) e [`drivers-db.html`](../drivers-db.html).  
> **Gate de Qualidade**: 32 suítes automatizadas no [`tests/guardian.test.js`](../tests/guardian.test.js) executadas localmente e em CI ([`.github/workflows/guardian.yml`](../.github/workflows/guardian.yml)).

---

## 1. Estrutura Modular do Repositório

```text
BassForge_Kit_Oficial/
├── scripts/build.js                   # Montador determinístico (--mirror / --check)
├── src/
│   ├── data/drivers-catalog.json      # 1.063 transdutores comerciais em JSON estrito
│   ├── sim/                           # BassForge Workstation -> index.html
│   │   ├── template.html              # Shell DOM + {{INLINE_CSS}} + {{INLINE_JS}}
│   │   ├── styles.css                 # Folha de estilo dark-lab
│   │   ├── 01-presets-analysis.js     # Presets, CHART_REGISTRY, ENV_PROFILES, restrições, DSP
│   │   ├── 02-drivers-bridge.js       # Ponte localStorage/#driver=, UI init, tabs
│   │   ├── 03a-auto-design-ports.js   # Auto-Design PhD, aptidão, dimensionamento & computePortGeometry
│   │   ├── 03b-physics-bp-planar.js   # Modelos acoplados BP4/BP6 e Planar TMM/ABCD 1D
│   │   ├── 03c-physics-solver.js      # analyzeTransferAlignment, recalculate, 900 pts (5–20k Hz)
│   │   ├── 04-charts-canvas.js        # Engine Canvas 2D, décadas prioritárias 5–20k, A/B, PNG, Auditoria
│   │   ├── 05a-cad-floors-autofix.js  # Pisos mínimos dinâmicos e autofix geométrico P0
│   │   ├── 05b-cad-validator.js       # Validador P0/P1, escapeHtmlStr, fmtNumSafe, bordas e colisões 2D
│   │   ├── 05c-cad-routing-bom.js     # Roteamento Reto/L-Port/Side-Firing, quick-fix, BOM & updateWoodlock
│   │   ├── 06-cad-pgs-3d.js           # PGS G01–G12, Nesting 2D, colisões 3D (CAD-03), 3D/2D Renderers
│   │   ├── 07a-export-dossier-json.js # Gate CAD-06, Pacote HTML, Dossiê A4 PDF & BuildPack JSON
│   │   ├── 07b-export-dxf-obj.js      # Exportadores DXF 2D R12, DXF 3D & OBJ 3D (CAD-04/14)
│   │   ├── 07c-export-freecad.js      # Gerador paramétrico B-Rep FreeCAD (.FCMacro)
│   │   ├── 08-electrical-dsp.js       # Associações, EPDR SOA, cabos DC/Áudio, Ganho/Zobel & Vol. Reverso
│   │   └── 09-shell-wizard.js         # Menus desktop, modais, barra de status, Wizard F6 & menu contexto
│   └── db/                            # Driver Database PRO -> drivers-db.html
│       ├── template.html              # Shell + {{INLINE_CSS}} + {{CATALOG_JSON}} + {{INLINE_JS}}
│       ├── styles.css                 # Folha de estilo Driver Database
│       └── app.js                     # CLAudioDatabaseAgent, ISO 9613-1, CRUD, TSV/CSV/JSON, PDF A4
├── docs/historico/                    # Documentos de especificação e auditoria histórica
├── engineering/ARCHITECTURE.md        # Este documento
├── tools/                             # Macros FreeCAD ao vivo (.FCMacro / .py) e geradores CLI
├── tests/guardian.test.js             # 32 Suítes de contrato, física, CAD PGS e Blacklist P0/P1
├── index.html                         # Build offline compilado
└── drivers-db.html                    # Build offline compilado
```

---

## 2. Contratos Físicos e de Dados (Inegociáveis)

1. **Golden Master (`Oversound 18 SUB 800 XT`, `Vb = 130 L`, `QL = 15`, `2×6" round`)**:
   - `Fb = Fs · α^0.31 = 44.62 Hz` (`± 0.02 Hz`), `Vtot = 148.73 L` (`± 0.05 L`), `F3 real = 42.90 Hz` (`± 0.20 Hz`).
2. **Passividade e Conservação de Energia**:
   - `G2_VentSPL` inclui $h^2$; `G10_ConeSPL` aplica atenuação HPF; impedância inclui $+ j\omega L_e$ e é verificada pós-varredura quanto à passividade ($|Z(f)| \ge R_e(T)$).
3. **6 Modos Acústicos & Varredura `5 Hz – 20 kHz` (900 pts)**:
   - `sealed`, `bass-reflex`, `bp4`, `bp6` (Paralela/Série), `planar` (Quadrada/Triângulo TMM) e `free-air`, com `0 NaN` e `0 Infinity`.
4. **PGS `G01–G12`, Gate Aerodinâmico `CAD-06` & Lista Negra P0/P1**:
   - Colisões 3D (`CAD-03`), roteamento lateral real (`CAD-04`), bloqueio com confirmação explícita em sopro crítico (`CAD-06`), paridade 3D nos 7 exportadores (`CAD-14`), anti-XSS (`escapeHtmlStr`) e zero blocos `catch` vazios.
5. **Chaves de Ponte (`localStorage` + Hash URL)**:
   - `BASSFORGE_DRIVER_DB_V1`, `BASSFORGE_ACTIVE_DRIVER_V1`, `#driver=<base64url>`.

---

## 3. Fluxo Obrigatório de Edição e Build

- Nunca editar `index.html` ou `drivers-db.html` diretamente — a Suíte 32 e `node scripts/build.js --check` validam igualdade byte-a-byte (`SHA-256`) contra `src/`.
- Todo código em `src/sim/` e `src/db/` permanece abaixo de `105 KB` por arquivo para edição segura sem truncamento em IDEs.
- Sempre executar antes de finalizar qualquer tarefa:

```bash
node scripts/build.js --mirror
node scripts/build.js --check
node tests/guardian.test.js
```
