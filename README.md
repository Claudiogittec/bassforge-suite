# BassForge SUITE — Simulador Eletroacústico, WoodLock CAD & Banco Oficial de Drivers

Suíte web autônoma (zero instalação / HTML5 + ES6 puro) para engenharia de gabinetes acústicos, extração e auditoria Thiele-Small, marcenaria CAD 3D (PGS v1), análise elétrica carga-amplificador e geração de manufatura.

## Arquitetura Modular + Distribuição Offline

O código-fonte vive em módulos focados (`< 105 KB` cada) sob [`src/`](./src) e é compilado pelo montador zero-dependência [`scripts/build.js`](./scripts/build.js) nos dois artefatos portáteis 100% offline (`file://`):

* **[`index.html`](./index.html) — BassForge Workstation** (`src/sim/*`)
  * **6 Modos / Topologias (`Selada · Dutada · BP4 · BP6 Paralela/Série · Planar Horn · Free-Air`)**: matriz de aptidão por driver via `EBP`, `Qts` e diâmetro, suporte a múltiplos alto-falantes (`1x` a `16x`), **Auto-Design PhD** (`Musical`, `Subgrave`, `SPL`) e compressão térmica (`ΔT`).
  * **Assistente Inteligente (`F6`)** e **Filtros Complexos HPF/LPF** (Butterworth, Linkwitz-Riley, Bessel de 6 a 48 dB/oitava com fase e Group Delay exatos).
  * **Aerodinâmica avançada de dutos**: cilíndrico padrão (`k=0.732`), Flared/Aeroport (`k=0.850`), **régua livre**, **régua em parede** (`k=1.343`) e **triângulo de canto** (`1–4` cantos), com ressonância de tubo de órgão (`f₁`), `j·ω·Le` na impedância complexa e roteamento **Reto / Duto em L (90°) / Side-Firing**.
  * **15 Séries Logarítmicas (`5 Hz – 20 kHz` em 900 pontos)**: perfis **Sala / Estúdio** (incl. Room Gain Waterhouse e SPL in Room) e **Automotivo** (Cabin Gain acoplado), **Comparador A/B** (`Δ = B − A`), sobreposições e exportação PNG (`1280×720`).
  * **Marcenaria CAD (`WoodLock`) + PGS 3D (`G01–G12`)**: retangular e trapezoidal, travamentos 6-eixos + Window Brace + Matriz DIV, Nesting 2D em chapa `2750×1830 mm`, Blueprint 2D, Vista 3D Explodida (0%–100% + Raio-X), detector de colisões 3D (`CAD-03`), gate aerodinâmico (`CAD-06`) e **7 exportadores** (Pacote de Obra HTML, Dossiê A4 PDF, JSON, DXF 2D R12, DXF 3D, OBJ e macro FreeCAD `.FCMacro`).
  * **Engenharia Elétrica & DSP**: associação de bobinas/subs sincronizada (`1–16`), EPDR (AES), estresse SOA, bitola de cabos DC (loop `2×L`, ampacidade, fusível ANL), cabo de áudio (`DF_eff`), ganho RMS / Limiter / Crossover 12 dB / Zobel e temperatura estimada da bobina por multímetro.

* **[`drivers-db.html`](./drivers-db.html) — Driver Database PRO** (`src/db/*` + `src/data/drivers-catalog.json`)
  * Catálogo oficial embutido com **1.063 transdutores**, auditoria cruzada ISO 9613-1 @ 20 °C, filtros paramétricos combinados, importação/exportação `TSV / CSV / JSON`, relatório PDF A4 e ponte direta para o simulador (`localStorage` + `#driver=`).

## Comandos Principais

```bash
# Compilar index.html e drivers-db.html + espelhar em ../bassforge-pro-x/
node scripts/build.js --mirror

# Verificar integridade byte-a-byte entre src/ e os HTMLs compilados
node scripts/build.js --check

# Rodar todas as 32 suítes do BassForge Engineering Guardian
node tests/guardian.test.js
```

## Como Usar

1. Abra [`index.html`](./index.html) ou [`drivers-db.html`](./drivers-db.html) diretamente no navegador (`file://` funciona 100% offline).
2. Para editar código, altere apenas os módulos em [`src/`](./src) e execute `node scripts/build.js --mirror` + `node tests/guardian.test.js` antes de commitar. Consulte [`AGENTS.md`](./AGENTS.md) e [`engineering/ARCHITECTURE.md`](./engineering/ARCHITECTURE.md).
