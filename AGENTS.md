# BassForge SUITE — Governança de Engenharia (AGENTS.md)

Este arquivo define os **contratos obrigatórios** para qualquer humano ou agente de IA (Antigravity, OpenCode, Copilot, ChatGPT, etc.) operando neste repositório.

---

## 1. Arquitetura e Regra Standalone

- **Núcleo do produto**: dois arquivos HTML5 + ES6 standalone zero-build:
  - `index.html` — **BassForge Workstation** (Simulador 5 topologias, 13 gráficos, Wizard, WoodLock, Elétrica/DSP, Comparador A/B).
  - `drivers-db.html` — **Driver Database PRO** (Banco oficial de drivers, auditoria T/S, filtros, TSV/CSV/JSON, PDF).
- **Compatibilidade `file://` obrigatória**: ambos os arquivos devem continuar abrindo diretamente no navegador (via `F5` local ou GitHub Pages) sem exigir servidor HTTP ou bundler.
- **Preservação**: nunca deletar ou sobrescrever arquivos em diretórios de arquivo histórico (`_arquivo*`).

---

## 2. Contratos Físicos e Matemáticos (Inegociáveis)

1. **Golden Master (`Oversound 18 SUB 800 XT`, `Vb = 130 L`, `QL = 15`, `2×6" round`)**:
   - Sintonia automática: `Fb = Fs · α^0.31 = 44.62 Hz` (`± 0.02 Hz`)
   - Volume bruto total: `Vtot = 148.73 L` (`± 0.05 L`)
   - Polinômio Small (1973, Eq. 19): `F3 real (-3 dB em G4) = 42.90 Hz` (`± 0.20 Hz`), pico `+1.46 dB` (`± 0.10 dB`) próximo de `70 Hz`.
2. **Conservação de Energia em Bass-Reflex (`G2` e `G10`)**:
   - `G2_VentSPL` deve incluir o fator $h^2$ ($|H_{\text{vent}}|^2 = h^2 \omega_n^4 / |D(s_n)|^2$).
   - `G10_ConeSPL` deve aplicar a atenuação do filtro subsônico (`+ hpf_db`) de forma consistente com `G2`, `G4` e `G6`.
3. **5 Topologias Suportadas**:
   - `bass-reflex`, `sealed`, `bp4`, `bp6` (Paralela e Série), `planar`.
   - Todas devem produzir 13 curvas finitas (`0 NaN`, `0 Infinity`).
4. **Imunidade `NaN`**:
   - `hpfCutoff <= 0` deve operar em bypass limpo (`hpf_lin = 1.0`, `hpf_db = 0.0`).
   - Entradas vazias ou zeradas (`Vb`, `Fb`, `QL`, `Fs`, `Qts`) nunca podem corromper os gráficos ou KPIs com `NaN`.

---

## 3. Contratos de Interface e Integração

1. **Ordem de Navegação**: `[🗄️ Banco de Drivers]` **sempre antes** de `[📊 Simulador 4ª Ordem]` em ambos os arquivos.
2. **Disciplina de Controles**: manter sliders (`<input type="range">`) **apenas** em `Vb` (`vbRange`) e `Fb` (`fbRange`); usar campos numéricos compactos para os demais parâmetros.
3. **Zero IDs HTML Duplicados**: todos os atributos `id="..."` em `index.html` e `drivers-db.html` devem ser estritamente únicos.
4. **Chaves de Ponte (`localStorage` + Hash)**:
   - `BASSFORGE_DRIVER_DB_V1`
   - `BASSFORGE_ACTIVE_DRIVER_V1`
   - `#driver=<base64url>`
5. **IP Hygiene (Estrito)**:
   - É **estritamente proibido** mencionar nomes comerciais de softwares simuladores concorrentes em UI, tooltips, comentários, logs ou documentação.
   - Marcas comerciais de **hardware físico** (alto-falantes reais de mercado) são dados técnicos públicos e devem ser preservadas.

---

## 4. BassForge Engineering Guardian — Gate Obrigatório

Antes de **qualquer commit ou push**, execute obrigatoriamente:

```bash
node tests/guardian.test.js
```

Nenhuma alteração pode ser considerada concluída se qualquer uma das suítes do Guardian falhar. Consulte [engineering/ARCHITECTURE.md](engineering/ARCHITECTURE.md) para o mapa completo de módulos, contratos e módulos congelados.
