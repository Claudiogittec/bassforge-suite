# BassForge SUITE — Mapa Arquitetural, Contratos e Inventário de Riscos

> **Status**: Baseline congelada (`commit 8c95504`, 22/11/2026)  
> **Escopo**: Auditoria estrutural completa de `index.html` (5.165 linhas · 239,7 KB) e `drivers-db.html` (3.349 linhas · 107,0 KB)  
> **Premissa Arquitetural Crítica**: Ambos os arquivos são **HTML5 standalone zero-build** — executam offline via `file://` (`F5`) e no GitHub Pages sem servidor nem bundler. Qualquer modularização futura em arquivos separados **não pode** usar ES Modules (`import/export`) diretamente sob `file://` sem um passo de build/empacotamento, pois navegadores bloqueiam `file://` via CORS.

---

## 1. Mapa Real de Módulos Implícitos

### 1.1 `index.html` — BassForge Workstation (74 funções declaradas)

| Domínio / Módulo Implícito | Faixa de Linhas | Funções | Acoplamento com DOM |
| :--- | :---: | :--- | :---: |
| **Comparador A/B & Snapshots** | L1812–L1859 | `captureSnapshotA`, `clearSnapshotA` | Médio (lê `currentCurves`, atualiza badges) |
| **Persistência de Projeto (`.json`)** | L1880–L1950 | `exportProjectJson`, `applyProjectData`, `importProjectJsonFile` | Alto (lê/escreve IDs de inputs) |
| **Controles de Banda, Sliders & Sintonia** | L1860–L2084 | `onSimNumDriversChange`, `setFreqRange`, `toggleChartOpt`, `syncSliderRange`, `updateFbLockButtonUI`, `setTuningMode`, `resetToOptimalFb`, `onVbRangeChange`, `onVbInputChange`, `onFbRangeChange`, `onFbInputChange`, `onFbVrInputChange` | Alto (manipula `vbRange`, `fbRange`, `isAutoTune`) |
| **Ponte com Banco de Drivers** | L2085–L2394 | `estimateVsubByDia`, `dbDriverId`, `upsertDbDrivers`, `refreshCustomDriversDropdown`, `loadDriversFromStorage`, `decodeBase64UrlJson`, `syncSimLeToElec`, `syncSimZnomToElec`, `applyDbDriver`, `importDriversJsonFile`, `updateSimAdvancedTelemetry`, `checkIncomingDriverLink` | Alto (`localStorage`, `location.hash`, inputs T/S) |
| **Inicialização & Navegação** | L2395–L2515 | `openExpandedChart`, `initUI`, `loadPreset`, `switchTab` | Alto (renderiza grid de 13 gráficos e abas) |
| **Physics Core — Topologias, Dutos & Transferência** | L2516–L3568 | `computeTopologySuitability`, `selectTopology`, `computePortGeometry`, `analyzeTransferAlignment`, `recalculate`, `generateSimulationData` | **Misto**: `computeTopologySuitability`, `computePortGeometry`, `analyzeTransferAlignment` e `generateSimulationData` são **quase puras** (recebem objeto `opts`/`p`); `recalculate` e `selectTopology` fazem leitura/escrita direta no DOM |
| **Motor de Gráficos Canvas (13 curvas)** | L3569–L4295 | `getLogFreqTicks`, `formatFreqTick`, `formatYTickLabel`, `pickNiceStep`, `computeYAxisScale`, `interpolateSeriesAtFreq`, `computeVisiblePeak`, `drawLogChart`, `bindInteractiveChart`, `getExpandedOverlayConfig`, `onExpandedOverlayChange`, `drawAllCharts`, `renderExpanded`, `exportExpandedPNG` | Alto (Canvas 2D + hover/cursor + modal expandido) |
| **Auditoria & Engenharia Auxiliar** | L4296–L4716 | `populateAuditTable`, `updateWoodlock`, `drawWoodlockBlueprint`, `updateElectrical`, `updateReverseVolume` | Alto (tabelas de corte, MDF, porta-malas, fiação, derating 70%) |
| **Workstation UI (Menus, Modais, Status)** | L4717–L4873, L5097–L5165 | `closeAllMenus`, `toggleMenu`, `openConfigModal`, `closeConfigModals`, `switchModalTab`, `toggleQuickSidebar`, `resetCurrentProject`, `updateDesktopStatusBar`, `openChartContextMenu`, `closeChartContextMenu`, `ctxAction` | Alto (menus desktop, barra de status, menu de contexto) |
| **Wizard de Alinhamento (6 Perfis)** | L4874–L5096 | `openWizardModal`, `selectWizardGoal`, `computeWizardPlan`, `updateWizardPreview`, `applyWizardRecommendation` | Médio/Alto (lê T/S do DOM, gera plano e aplica) |

### 1.2 `drivers-db.html` — Driver Database PRO (37 funções declaradas)

| Domínio / Módulo Implícito | Faixa de Linhas | Funções | Acoplamento |
| :--- | :---: | :--- | :---: |
| **Persistência & Contadores** | L2520–L2640 | `updateCatalogCounters`, `saveCatalogStorage`, `loadCatalogStorage` | `localStorage` (`BASSFORGE_DRIVER_DB_V1`) |
| **Formulário T/S & Auditoria Física** | L2755–L2866 | `getFormValues`, `onParamInput`, `adicionarTabela`, `resetForm` | DOM + motor de validação cruzada interno |
| **Filtros Combinados & Tabela** | L2867–L3023 | `resetDbFilters`, `driverMatchesTopo`, `renderTable`, `selectRow`, `carregarLinhaSelecionada`, `carregarNoFormulario`, `excluirSelecionado`, `excluirTodos`, `restaurarCatalogoFabrica` | DOM + estado `catalog` |
| **Ponte para Simulador** | L3043–L3098 | `buildSimulatorPayload`, `encodePayloadBase64Url`, `enviarParaSimulador`, `enviarFormularioParaSimulador`, `enviarLinhaParaSimulador` | `localStorage` (`BASSFORGE_ACTIVE_DRIVER_V1`) + URL Hash `#driver=` |
| **Importação / Exportação** | L3099–L3252 | `parseTsvRows`, `parseJsonImport`, `previewTSV`, `handleTSVFileSelect`, `confirmTSVImport`, `exportTSV`, `exportCSV`, `exportJSON`, `downloadFile` | FileReader / Blob download |
| **Modais & Relatório PDF** | L3253–L3349 | `openCatalogModal`, `openImportTSVModal`, `openReportModal`, `closeModal`, `renderCatalogList`, `renderPrintableReport`, `downloadReportPDF` | DOM + CDN `html2pdf.js@0.10.1` |

---

## 2. Contratos de Dados e Integração

### 2.1 Chaves de Persistência (`localStorage`)
- **`BASSFORGE_DRIVER_DB_V1`**: Objeto JSON contendo o catálogo persistido de drivers (`{ version, updatedAt, drivers: [...] }` ou array de drivers). Lido por `index.html` (`loadDriversFromStorage`) e lido/gravado por `drivers-db.html` (`loadCatalogStorage` / `saveCatalogStorage`).
- **`BASSFORGE_ACTIVE_DRIVER_V1`**: Payload JSON do último driver enviado pelo Banco de Drivers ao Simulador.
- **URL Hash (`#driver=<base64url>`)**: Transporte fallback para cenários `file://` onde `localStorage` pode estar isolado por origem no navegador. Decodificado por `decodeBase64UrlJson()` em `index.html` (`checkIncomingDriverLink()`).

### 2.2 Contrato de Projeto Salvo (`.json`)
- Schema: `bassforge-project/v1` (`exportProjectJson` / `applyProjectData`).
- Preserva: topologia, `nDrivers`, `deltaT`, todos os parâmetros T/S, `Vb`, `Vr`, `Fb`, `FbVr`, `bp6Mode`, `QL`, `tempC`, `cabinLen`, `hpfCutoff`, tipo e dimensões do duto, e estado `isAutoTune`.

### 2.3 Contrato Matemático do Physics Core (Congelado)
- **Golden Master**: `Oversound 18 SUB 800 XT` (`Fs=40 Hz`, `Qes=0.446`, `Qms=7.20`, `Qts=0.420`, `Vas=185 L`, `Re=5.10 Ω`, `Sd=1186 cm²`, `Xmax=9.8 mm`, `Pe=800 W`, `Vsub=9 L`, `Vb=130 L`, `QL=15`, `2×6" round`):
  - `Fb = Fs · α^0.31 = 44.62 Hz` (`h = 1.1155`)
  - `Vtot = 148.73 L`
  - Polinômio Small (1973, Eq. 19): `F3 real (-3 dB em G4) = 42.90 Hz`, pico `+1.46 dB @ ~69.8 Hz`
- **Conservação de Energia em `G2_VentSPL`**: $|H_{\text{vent}}(s_n)|^2 = h^2 \omega_n^4 / |D(s_n)|^2$ (em `f = Fb`, `G2 ≈ G6`).
- **Coerência HPF em `G10_ConeSPL`**: atenuação LR4 (`+ hpf_db`) aplicada consistentemente em `G2`, `G4`, `G6` e `G10`.
- **Imunidade `NaN`**: `hpfCutoff <= 0` opera em bypass limpo (`hpf_lin = 1.0`, `hpf_db = 0.0`); entradas zero/vazias (`Vb`, `Fb`, `QL`, `Fs`, `Qts`) nunca produzem `NaN` nas 13 curvas.

---

## 3. Auditoria Real de `innerHTML` (R5 — 28 ocorrências mapeadas)

| Arquivo | Linha | Origem dos Dados | Classificação XSS |
| :--- | :---: | :--- | :--- |
| `index.html` | L2243 | `nome` (`drv.brand`, `drv.model`, `drv.name` de JSON/localStorage) | **ATENÇÃO** — interpolar com escape HTML em futura correção |
| `index.html` | L5029 | `dName` (`option.text` derivado de driver importado) | **ATENÇÃO** — interpolar com escape HTML em futura correção |
| `drivers-db.html` | L2911 | `d.brand`, `d.model`, `d.series` na tabela principal | **ATENÇÃO** — dados podem vir de TSV/JSON importado |
| `drivers-db.html` | L3162 | Preview de linhas TSV/JSON importadas | **ATENÇÃO** — entrada externa direta |
| `drivers-db.html` | L3267 | Lista do modal de catálogo (`d.brand`, `d.model`) | **ATENÇÃO** — dados importáveis |
| `drivers-db.html` | L3286 | Relatório imprimível (`d.brand`, `d.model`, `d.notes`) | **ATENÇÃO** — dados importáveis |
| `index.html` | L2125, L2350, L2405, L2409, L2899, L3045, L4203, L4217, L4219, L4315, L4420, L4441, L4451, L4602, L4632, L4680, L4705, L4836, L4870, L5035, L5045 | Números formatados (`.toFixed()`), strings literais internas ou SVG estático | **Baixo risco** (sem texto arbitrário externo) |
| `drivers-db.html` | L3158 | String literal estática | **Seguro** |

---

## 4. Registro de Módulos Congelados (*Frozen Modules*)

Nenhuma alteração nos itens abaixo é permitida sem atualização explícita e aprovação da suíte `node tests/guardian.test.js`:

1. `computePortGeometry()` (`index.html` L2573–L2657) — Geometrias `round`, `flared`, `slot`, `slot_wall`, `triangle` e ressonância tubo de órgão `f1`.
2. `analyzeTransferAlignment()` (`index.html` L2658–L2803) — Polinômio Small 1973 e extração de `F3`, `FL`, `FH` e pico real nas 5 topologias.
3. `generateSimulationData()` (`index.html` L3182–L3568) — Síntese das 13 curvas (`G1`–`G13`), EPDR e conservação de energia `G2`/`G10`.
4. Contratos de ponte (`BASSFORGE_DRIVER_DB_V1`, `BASSFORGE_ACTIVE_DRIVER_V1`, `#driver=`).

---

## 5. Dependências Externas

- **Google Fonts** (`Inter` e `JetBrains Mono`): degradação graciosa offline para fontes do sistema.
- **`html2pdf.js@0.10.1` via `cdnjs`** (`drivers-db.html` L10): usado exclusivamente no botão de exportação PDF; o restante da aplicação funciona 100% offline.

---

## 6. Pendências Técnicas Conhecidas (Backlog Controlado)

1. **Escape HTML nos 6 pontos de `innerHTML` com strings externas** (Seção 3).
2. **Impedância em Caixa Selada/Planar (`G11_InBoxZ`)**: refinar amortecimento mecânico para usar $Q_{mc} = Q_{ms}\sqrt{1+\alpha}$ em vez de $Q_{tc}$ (para precisão do pico de impedância em $F_c$).
3. **Migração de Schema `localStorage`**: adicionar campo explícito `schemaVersion` e rotina de migração defensiva antes de evoluir campos do banco.
