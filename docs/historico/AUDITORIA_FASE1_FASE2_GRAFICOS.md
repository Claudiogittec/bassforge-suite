# BassForge — Auditoria (FASE 1) + Planejamento (FASE 2) dos Gráficos

**Spec de origem:** [SPEC_ARQUITETURA_GRAFICOS_ARCH_AUTO.md](SPEC_ARQUITETURA_GRAFICOS_ARCH_AUTO.md)
**Escopo auditado:** `index.html` (297.867 B · 22/11/2026 13:48) + modelos de referência de sala e cabine acústica (domínio público)
**Baseline de código:** `commit 50d3235` (`origin/main`)
**Guardian:** `node tests/guardian.test.js` → **11 passed, 0 failed** (revalidado em 22/11/2026)
**Status:** ⏸️ **FASE 3 + FASE 4 BLOQUEADAS — aguardando aprovação explícita do usuário**
**Diff de implementação:** **nenhum** (este documento é só auditoria + plano)

---

## 1. Arquitetura Atual Identificada (FASE 1)

`index.html` concentra as 3 responsabilidades da spec de forma **acoplada**:

| Camada exigida pela spec | Implementação atual | Acoplamento |
| :--- | :--- | :--- |
| **Physics Core** | `computePortGeometry()` L2573 · `analyzeTransferAlignment()` L2658 · `recalculate()` L2804 · `generateSimulationData()` L3263 | Misto (as 4 são quase puras via `opts`/`p`; `recalculate` lê/escreve DOM) |
| **Analysis Engine** | **Inexistente** como módulo. Critérios vivem espalhados em `CHARTS_INFO` (limites de eixo) + `computeTopologySuitability()` (aptidão de topologia) | — |
| **Visualization Layer** | `drawLogChart()` L3741 · `drawAllCharts()` L4295 · `renderExpanded()` L4341 · `exportExpandedPNG()` | Alto (Canvas 2D, hover, modal, PNG) |

**Grade de dados:** `generateSimulationData()` amostra **N = 600 pontos logarítmicos de 10 Hz a 2000 Hz** (L3267–L3270) e popula o global `currentCurves` com 13 chaves estáveis `G1_MaxPower` … `G13_GroupDelay` + `meta`. *(Verificado: `analyzeTransferAlignment()` usa N = 320 — grade própria, apenas para extração de F3/FL/FH/pico, não alimenta a UI.)*

**Ordem fixa hoje:** `CHARTS_INFO` (L1832–L1845) é um array **único e estático** que mistura *definição física* (chave, unidade, limites de eixo, cor) com *ordem de apresentação*. É consumido por `initUI()` L2484 (grid), `drawAllCharts()` L4297, `#expandedSelect` L1219, `captureSnapshotA()` e `generateBuildPackHtml()`.

**Gap de Analysis Engine (achado real):** os limites físicos (`Xmax`, `5%/10% Mach`, `Pe`, `Re`, `-3 dB`, `20 ms`) são **desenhados como linhas dentro dos canvases**, mas não existe camada que **avalie violação** e destaque o card. Hoje o usuário precisa enxergar a linha e concluir sozinho.

---

## 2. Mapeamento dos 13 Gráficos e Fontes Reais de Dados

| ID | Chave em `currentCurves` | Título atual | Un. | Fonte real no Physics Core | Limite / alerta desenhado |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `G1` | `G1_MaxPower` | `#1 Max Power (Watts RMS)` | W | `min(Pe, Pe·(Xmax/exc)²)` — L3393, L3508, L3565 | `Pe` |
| `G2` | `G2_VentSPL` | `#2 Vent SPL (dB-SPL)` | dB | `spl_rated + 10·log10(h²·ωn⁴/\|D\|²) + hpf_db` (0 em Selada/Planar) | — |
| `G3` | `G3_FreeAirZ` | `#3 Free Air Impedance (Ohms)` | Ω | Impedância motional Small 1972 (RLC) | `Re` |
| `G4` | `G4_NormAmp` | `#4 Normalized Amplitude (dB)` | dB | `10·log10(\|H\|²) + hpf_db` (Small 1973 · BP4 · BP6 · Planar) | `0 dB`, `-3 dB` |
| `G5` | `G5_SPLinCar` | `#5 SPL in Car (dB)` | dB | `G6_SPLThermic + t_cabin_db` | — |
| `G6` | `G6_SPLThermic` | `#6 SPL Thermic (dB)` | dB | `spl_rated(ΔT) + G4` | compressão `ΔT` |
| `G7` | `G7_CabinGain` | `#7 Cabin Gain (dB)` | dB | `G4 + t_cabin_db` *(resposta acoplada, ver §7)* | `0 dB` |
| `G8` | `G8_ConeExcursion` | `#8 Cone Excursion (mm)` | mm | Small 1973 Eq. 24 com `QB = 7.0` × `hpf_lin` (L3296, L3382) | **`Xmax`** |
| `G9` | `G9_PortAirVel` | `#9 Port Air Velocity (m/s)` | m/s | `airVel·\|sn/D(sn)\|/max_hv · hpf_lin` (0 em Selada/Planar) | **`5% / 10% Mach`** |
| `G10` | `G10_ConeSPL` | `#10 Cone SPL (dB-SPL)` | dB | `spl_rated + 10·log10(\|H_cone\|²) + hpf_db` | — |
| `G11` | `G11_InBoxZ` | `#11 In Box Impedance (Ohms)` | Ω | Small 1973 Eq. 11 / Selada / BP + EPDR | `Re`, EPDR mín. |
| `G12` | `G12_Phase` | `#12 Fase Acústica (Graus)` | ° | `atan2(Im H, Re H)·180/π` | — |
| `G13` | `G13_GroupDelay` | `#13 Group Delay (ms)` | ms | `-d(φ_unwrapped)/dω · 1000` | **`20 ms`** |

---

## 3. Modelos Ambientais: o que existe vs. o que não existe

### Referências externas (`room.iad` / `car.iad`) — verificadas
- `room.iad` (665 B) e `car.iad` (647 B), cabeçalho `6.000`, descrições `"Sample acoustic response of a listening room."` / `"Sample acoustic response of a car interior."`.
- São **tabelas empíricas ponto-a-ponto** (curvas amostrais em dB), **não** equações analíticas. Não copiáveis para o BassForge sem inventar física.

### AUTOMOTIVE — **parcialmente existente** (modelo analítico 1D de pressurização)
- Entrada: `cabinLen` (`#cabinLen`, padrão `3.4 m`) → `F100 = c / cabinLen` (L2959) → `100.99 Hz` @ 20 °C.
- Equação implementada (L3342):
  `T_cabin(f) = 20·log10( 1 + (√2 − 1)·(F100/f)² )` — assíntota `+12 dB/oitava` abaixo de `F100`.
- Alimenta `G5_SPLinCar` e `G7_CabinGain`.
- **Limitação documentada:** modela apenas a maior dimensão longitudinal. Sem geometria 3D do habitáculo, sem posição da caixa, sem modos transversais.

### ARCHITECTURAL — **não existe modelo de sala**
- Não há entrada de dimensões `L×W×H`, nem cálculo de modos estacionários, nem posição caixa/ouvinte, nem função de `Room Gain` / `SPL in Room`.
- **Ressalva da spec respeitada:** `Room Gain ≠ Cabin Gain`. `G5`/`G7` **nunca** serão reaproveitados ou renomeados como `SPL in Room` / `Room Gain`.

---

## 4. Classificação Obrigatória de Cada Slot (FASE 2)

### Perfil ARCHITECTURAL
| Pos. | Slot | ID/Fonte | Classe | Comportamento na UI |
| :---: | :--- | :--- | :--- | :--- |
| 1 | SPL in Room | — | **Ainda não implementada** | Card explícito "modelo de sala não implementado", **sem curva** |
| 2 | Normalized Amplitude | `G4` | Calculada | Normal (prioridade #1) |
| 3 | Group Delay | `G13` | Calculada | + badge se `> 20 ms` |
| 4 | Cone Excursion | `G8` | Calculada | + badge crítico se `pico > Xmax` |
| 5 | Port Air Velocity | `G9` | Calculada | + badge crítico se `pico > velLimit` |
| 6 | Max Power | `G1` | Calculada | + badge se limitado mecanicamente |
| 7 | SPL Thermic | `G6` | Calculada | + badge se `ΔT > 0 °C` |
| 8 | Vent SPL | `G2` | Calculada | Normal |
| 9 | Acoustic Phase | `G12` | Calculada | Normal |
| 10 | In Box Impedance | `G11` | Calculada | Normal |
| 11 | Free Air Impedance | `G3` | Calculada | Normal |
| 12 | Cone SPL | `G10` | Calculada | Normal |
| 13 | Room Gain | — | **Ainda não implementada** | Card explícito "(não usa Cabin Gain)", **sem curva** |

### Perfil AUTOMOTIVE
| Pos. | Slot | ID/Fonte | Classe | Comportamento na UI |
| :---: | :--- | :--- | :--- | :--- |
| 1 | SPL in Car | `G5` | **Estimada por modelo físico** | Rótulo do modelo (`F100 = c / L_carro`) |
| 2 | Cabin Gain | `G7` | **Estimada por modelo físico** | Rótulo explícito (ver §7) |
| 3 | Cone Excursion | `G8` | Calculada | + badge crítico |
| 4 | Max Power | `G1` | Calculada | + badge |
| 5 | Port Air Velocity | `G9` | Calculada | + badge crítico |
| 6 | SPL Thermic | `G6` | Calculada | + badge `ΔT` |
| 7 | Vent SPL | `G2` | Calculada | Normal |
| 8 | Group Delay | `G13` | Calculada | + badge `> 20 ms` |
| 9 | Normalized Amplitude | `G4` | Calculada | Normal |
| 10 | Acoustic Phase | `G12` | Calculada | Normal |
| 11 | In Box Impedance | `G11` | Calculada | Normal |
| 12 | Free Air Impedance | `G3` | Calculada | Normal |
| 13 | Cone SPL | `G10` | Calculada | Normal |

---

## 5. Plano de Implementação (3 camadas, Physics Core congelado)

1. **Camada 1 — Physics Core: 🔒 100% congelada.** Nenhuma linha em `generateSimulationData()`, `computePortGeometry()`, `analyzeTransferAlignment()`, fórmulas de `recalculate()` ou contrato de `currentCurves`.
2. **Camada 2 — Analysis Engine (novo, puro, dentro de `index.html`):**
   - `CHART_REGISTRY`: metadados por ID estável (`G1`…`G13`) + `availability: 'calculated' | 'modeled' | 'unimplemented'`, título padronizado, unidade, limites.
   - `ENV_PROFILES`: configuração declarativa `{ order: [13 slots], label, description, modelNote }` para `'architectural'` e `'automotive'`.
   - `evaluatePhysicalConstraints(curves, fMin, fMax)`: função pura → `G8 > Xmax` (crítico), `G9 > velLimit` (crítico/aviso), `G1 < Pe` na banda útil (aviso), `G6` com `ΔT > 0` (aviso), `G13 > 20 ms` (aviso).
   - `setAnalysisEnvironment(env)`: alterna perfil **sem chamar `recalculate()`** e **sem tocar em nenhum input do projeto** — só reordena apresentação (`buildChartGridForEnv()` + `drawAllCharts()` + `renderExpanded()` + `#expandedSelect`).
3. **Camada 3 — Visualization Layer:**
   - Seletor compacto `Ambiente: [🏛️ Architectural | 🚗 Automotive]` em `#chartToolbar`.
   - Reordenação de `#tabGrid` e `#expandedSelect` + badges de alerta nos cards (`G1`, `G6`, `G8`, `G9`, `G13`).
   - Em Architectural, os 2 slots sem motor viram cards "Não implementado" e ficam **fora** do seletor Expandido (nunca canvas vazio ou falso).
   - `analysisEnv` persistido em `exportProjectJson()` / `applyProjectData()` de forma retrocompatível.

---

## 6. Testes de Validação (FASE 3 — Suite 12 do Guardian)

1. As 13 séries de `currentCurves` permanecem **bit-a-bit idênticas** após alternar `automotive ↔ architectural` (ida e volta).
2. `ENV_PROFILES.architectural.order` e `.automotive.order` têm exatamente 13 slots, na ordem da §3 da spec.
3. `SPL in Room` e `Room Gain` têm `availability === 'unimplemented'` e **nunca** leem `G5_SPLinCar` / `G7_CabinGain`.
4. `setAnalysisEnvironment()` preserva intactos `Vb`, `Fb`, `Fs`, `Qes`, `Qms`, `Vas`, `boxType`, `isAutoTune`, `isHpfEnabled`, `nDrivers`, `deltaT`.
5. `evaluatePhysicalConstraints()` dispara crítico com `G8 > Xmax` e com `G9 > velLimit` em **ambos** os ambientes.
6. Regressão global: 0 IDs duplicados, IP Hygiene = 0 vazamentos, Golden Master `Fb = 44.62 Hz` / `Vtot = 148.73 L` / `F3 = 42.90 Hz` intactos, 11 suítes atuais continuam PASS.

---

## 7. Achados da verificação independente (OpenCode)

Três pontos que a auditoria original não destacou e que precisam de decisão **antes** da FASE 4:

1. **`G7_CabinGain` não é "gain" puro.** Nas 3 topologias o valor é `G4_NormAmp + t_cabin_db` (L3368, L3501, L3538) — ou seja, é a **resposta do box já acoplada à cabine**, não o ganho de cabine isolado (`t_cabin_db`). O título `#7 Cabin Gain` sugere grandeza isolada. **Recomendação:** manter a fórmula congelada e corrigir apenas o **rótulo** na Visualization Layer (`Cabin Gain Acoplado · G4 + T_cabin`), ou expor `t_cabin_db` puro como série nova — esta segunda opção **exige aprovação de contrato** porque mexe em `currentCurves`.
2. **`#expandedSelect` e `generateBuildPackHtml()` iteram `CHARTS_INFO` por índice/ordem.** A reordenação por perfil precisa ser feita por **ID estável**, nunca por posição — caso contrário o BuildPack e o PNG expandido trocam de gráfico.
3. **`analyzeTransferAlignment()` usa grade N = 320 e a UI N = 600.** Qualquer badge/limiar do Analysis Engine deve ser calculado sobre a série de 600 pontos de `currentCurves` (fonte da UI), não sobre a grade de 320 — evita divergência entre badge e curva desenhada.

---

## 8. Módulos Congelados vs. Tocáveis

| Status | Módulos |
| :--- | :--- |
| 🔒 **CONGELADOS (zero alteração)** | `generateSimulationData()` · `computePortGeometry()` · `analyzeTransferAlignment()` · equações físicas de `recalculate()` · `validateBuildGeometry()` · `autofixWoodlockGeometry()` · `computeWoodlockFloors()` · `updateWoodlock()` · `drawWoodlockBlueprint()` · `updateElectrical()` · `updateReverseVolume()` · `drivers-db.html` · contratos `localStorage`/hash |
| ✏️ **TOCÁVEIS (somente após aprovação)** | `CHARTS_INFO` → `CHART_REGISTRY` + `ENV_PROFILES` + `evaluatePhysicalConstraints()` + `setAnalysisEnvironment()` · `#chartToolbar` (seletor de ambiente) · `initUI()` / `buildChartGridForEnv()` · `drawAllCharts()` (badges) · `renderExpanded()` / `#expandedSelect` · `exportProjectJson()` / `applyProjectData()` (campo `analysisEnv`) · `tests/guardian.test.js` (Suite 12) |

---

## 9. Riscos e Dependências

- **Risco baixo** em `captureSnapshotA()` e `generateBuildPackHtml()`: mantendo `CHARTS_INFO` com os 13 registros físicos estáveis e usando `ENV_PROFILES` só para ordenação, não há quebra de dependência externa.
- **Risco médio** em `exportExpandedPNG()`: depende de `#expandedSelect` resolvido por `id` — coberto pelo achado §7.2.
- **Dependência** de decisão do usuário: ambiente padrão no primeiro carregamento.

---

## 10. Decisões pendentes para liberar a FASE 3 + FASE 4

1. **Aprovar** esta auditoria + plano? (sem aprovação, nenhum código é tocado)
2. **Ambiente padrão** no boot: `Automotive` (13 gráficos ativos desde o início, comportamento atual) ou `Architectural` (com 2 cards "não implementado")?
3. **`G7`**: corrigir apenas o rótulo (recomendado, Physics Core intocado) ou criar série nova de `Cabin Gain` puro (exige aprovação de contrato)?
