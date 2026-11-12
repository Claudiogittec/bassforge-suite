# BassForge SUITE — Simulador Eletroacústico & Banco Oficial de Drivers

Suíte web autônoma (zero instalação / HTML5 + ES6 puro) para engenharia de gabinetes acústicos, extração e auditoria Thiele-Small, marcenaria CAD e análise elétrica carga-amplificador.

## Módulos Incluídos

* **[`index.html`](./index.html) — Simulador Eletroacústico**
  * Modelagem Thiele-Small de 2ª e 4ª ordem (caixas seladas e dutadas / bass-reflex).
  * Grade de 12 gráficos logarítmicos em alta precisão (`10 Hz – 2 kHz`), zoom por banda (`15–200 Hz`, `15–500 Hz`, `10–1k Hz`, `10–2k Hz`), Auto-Scale Y acústico, marcadores de sintonia (`Fs`, `Fb`/`Fc`, `F3`, `HPF`), linhas de limite (`Xmax`, `Mach`, `Pe`, `Re`, `-3 dB`), crosshair X+Y interativo, sobreposição multi-curva e exportação PNG (`1280×720`).
  * Marcenaria CAD & Plano de Corte (WoodLock) com desenho técnico em canvas e cálculo de chapas.
  * Engenharia Elétrica & DSP: associação de bobinas, cálculo de EPDR, impedância complexa, dimensionamento de cabos, rede Zobel e proteção de sobrecarga.

* **[`drivers-db.html`](./drivers-db.html) — Banco Oficial de Drivers**
  * Catálogo técnico embutido (77 transdutores) com persistência local automática (`localStorage`), criação, edição e busca.
  * Motor de auditoria cruzada Thiele-Small Class-I (ISO 9613-1 @ 20 °C), com validação não-tautológica de `Fs` por rotas mecânica, acústica e elétrica e suporte opcional a `Mms` e `Bl` de catálogo.
  * Exportação e importação completas em esquema de 22 colunas (`TSV`, `CSV`, `JSON` v1 e relatório PDF).
  * Ponte direta de carregamento com 1 clique (`🚀 ABRIR NO SIMULADOR`) propagando todos os parâmetros completos para o simulador (compatível tanto via servidor local quanto via `file://`).

## Como Usar

1. Clone ou baixe o repositório.
2. Abra [`index.html`](./index.html) ou [`drivers-db.html`](./drivers-db.html) diretamente no navegador (ou sirva a pasta localmente com qualquer servidor HTTP estático, ex.: `python -m http.server`).
3. No **Banco de Drivers**, cadastre ou selecione um transdutor e clique em **Abrir no Simulador** — ou importe um arquivo `.json` diretamente pela barra lateral do simulador.
