# BassForge SUITE — Simulador Eletroacústico & Banco Oficial de Drivers

Suíte web autônoma (zero instalação / HTML5 + ES6 puro) para engenharia de gabinetes acústicos, extração e auditoria Thiele-Small, marcenaria CAD e análise elétrica carga-amplificador.

## Módulos Incluídos

* **[`index.html`](./index.html) — Simulador Eletroacústico (Workstation Desktop)**
  * **5 Topologias com Matriz de Aptidão por Driver (`Selada · Dutada · BP4 · BP6 Paralela/Série · Planar Horn`)**: classifica automaticamente cada caixa como *Ideal*, *Compatível* ou *Não Recomendada* via `EBP`, `Qts` e diâmetro, com miniaturas SVG e suporte a **múltiplos alto-falantes (`1x` a `8x`)** e **compressão térmica (`ΔT = 0 / +60 / +100 / +130 °C`)**.
  * **Assistente de Projeto (Wizard `F6`) com 6 Perfis de Sintonia**: *Optimum*, *Low Bass*, *Attack*, *Trio / Ataque*, *Sub-Extremo* e *SPL Máximo*, dimensionando automaticamente volume, sintonia, HPF e duto laminar.
  * **Dimensionamento avançado de dutos**: cilíndrico padrão (`k=0.732`), Aeroport/flared (`k=0.850`), **duto régua livre** (`k=0.732`), **duto régua em parede** (`k=1.343`) e **duto triângulo de canto** (`k=1.343`), com razão de aspecto, diâmetro hidráulico e **ressonância de tubo de órgão (`f_pipe`)**.
  * Grade de **13 gráficos logarítmicos** (`10 Hz – 2 kHz`), incluindo **Group Delay (ms)**, zoom por banda, Auto-Scale Y, marcadores (`Fs`, `Fb`/`Fc`, `F3`, `HPF`, `f_pipe`), limites (`Xmax`, `Mach`, `Pe`, `Re`, `-3 dB`, `20 ms`), menu de contexto (botão direito), **Comparador A/B** (`Δ = B − A`), exportação PNG (`1280×720`) e **Salvar / Abrir Projeto (`.json`)**.
  * **Marcenaria CAD (WoodLock) & Pacote de Construção**: projeto sempre parte fisicamente válido via **autofix geométrico** (mantendo `Vb`/`Fb` intactos) e **pisos mínimos dinâmicos** que impedem reduzir cotas abaixo do aplicável para driver/dutos; inclui validador P0, blueprint real (`Lv` vs `C` e furação), plano de corte completo (MDF + sarrafos + duto `Lv`), gabarito de furação `(X, Y)` e **Exportar Pacote de Construção (HTML imprimível offline / BuildPack JSON)**.
  * **Engenharia Elétrica & DSP**: associação de bobinas sincronizada, EPDR, bitola de cabos, rede Zobel, limiter DSP, **Derating 70% (IEC/NBR)** e **estimativa de temperatura da bobina (°C)** por leitura de multímetro.

* **[`drivers-db.html`](./drivers-db.html) — Banco Oficial de Drivers**
  * Catálogo técnico embutido (77 transdutores) com persistência local automática (`localStorage`), busca textual e **filtros paramétricos combinados** (aptidão de caixa `Selada/Dutada/BP4/BP6/Planar`, diâmetro, `Pe`, `Fs`, `Qts`).
  * Motor de auditoria cruzada Thiele-Small Class-I (ISO 9613-1 @ 20 °C), com validação não-tautológica de `Fs` por rotas mecânica, acústica e elétrica e suporte opcional a `Mms` e `Bl` de catálogo.
  * Exportação e importação completas em esquema de 22 colunas (`TSV`, `CSV`, `JSON` v1 e relatório PDF).
  * Ponte direta de carregamento com 1 clique (`🚀 ABRIR NO SIMULADOR`) propagando todos os parâmetros completos para o simulador (compatível tanto via servidor local quanto via `file://`).

## Como Usar

1. Clone ou baixe o repositório.
2. Abra [`index.html`](./index.html) ou [`drivers-db.html`](./drivers-db.html) diretamente no navegador (ou sirva a pasta localmente com qualquer servidor HTTP estático, ex.: `python -m http.server`).
3. No **Banco de Drivers**, cadastre ou selecione um transdutor e clique em **Abrir no Simulador** — ou importe um arquivo `.json` diretamente pela barra lateral do simulador.

