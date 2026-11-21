# BassForge SUITE — Simulador Eletroacústico & Banco Oficial de Drivers

Suíte web autônoma (zero instalação / HTML5 + ES6 puro) para engenharia de gabinetes acústicos, extração e auditoria Thiele-Small, marcenaria CAD e análise elétrica carga-amplificador.

## Módulos Incluídos

* **[`index.html`](./index.html) — Simulador Eletroacústico**
  * Modelagem Thiele-Small de 2ª e 4ª ordem (caixas seladas e dutadas / bass-reflex) com suporte a **múltiplos alto-falantes acoplados** (`1x` a `8x`) e **compressão térmica de potência** da bobina (`ΔT = 0 / +60 / +100 / +130 °C`).
  * **Dimensionamento avançado de dutos**: cilíndrico padrão (`k=0.732`), cilíndrico Aeroport/flared (`k=0.850`), **duto régua/retangular livre** (`k=0.732`) e **duto régua em parede/shelf** (`k=1.343`), com cálculo de razão de aspecto, diâmetro hidráulico e **ressonância longitudinal de tubo de órgão (`f_pipe`)**.
  * Grade de **13 gráficos logarítmicos** em alta precisão (`10 Hz – 2 kHz`), incluindo **Group Delay (ms)** com limiar psicoacústico de `20 ms`, zoom por banda (`15–200 Hz`, `15–500 Hz`, `10–1k Hz`, `10–2k Hz`), Auto-Scale Y acústico, marcadores (`Fs`, `Fb`/`Fc`, `F3`, `HPF`, `f_pipe`), limites (`Xmax`, `Mach`, `Pe`, `Re`, `-3 dB`, `20 ms`), crosshair X+Y interativo, **Comparador A/B** (`Congelar Curva A` com leitura de `Δ = B − A`), sobreposição multi-curva e exportação PNG (`1280×720`).
  * **Salvar / Abrir Projeto Completo (`.json`)**: exportação e restauração integral do estado da caixa, dutos, marcenaria e elétrica (`bassforge-project/v1`).
  * Marcenaria CAD & Plano de Corte (WoodLock) com desenho técnico em canvas (incluindo múltiplos cones no baffle) e cálculo de chapas.
  * Engenharia Elétrica & DSP: associação de bobinas sincronizada com a quantidade de falantes, cálculo de EPDR, impedância complexa, dimensionamento de cabos, rede Zobel e proteção de sobrecarga.

* **[`drivers-db.html`](./drivers-db.html) — Banco Oficial de Drivers**
  * Catálogo técnico embutido (77 transdutores) com persistência local automática (`localStorage`), criação, edição e busca.
  * Motor de auditoria cruzada Thiele-Small Class-I (ISO 9613-1 @ 20 °C), com validação não-tautológica de `Fs` por rotas mecânica, acústica e elétrica e suporte opcional a `Mms` e `Bl` de catálogo.
  * Exportação e importação completas em esquema de 22 colunas (`TSV`, `CSV`, `JSON` v1 e relatório PDF).
  * Ponte direta de carregamento com 1 clique (`🚀 ABRIR NO SIMULADOR`) propagando todos os parâmetros completos para o simulador (compatível tanto via servidor local quanto via `file://`).

## Como Usar

1. Clone ou baixe o repositório.
2. Abra [`index.html`](./index.html) ou [`drivers-db.html`](./drivers-db.html) diretamente no navegador (ou sirva a pasta localmente com qualquer servidor HTTP estático, ex.: `python -m http.server`).
3. No **Banco de Drivers**, cadastre ou selecione um transdutor e clique em **Abrir no Simulador** — ou importe um arquivo `.json` diretamente pela barra lateral do simulador.

