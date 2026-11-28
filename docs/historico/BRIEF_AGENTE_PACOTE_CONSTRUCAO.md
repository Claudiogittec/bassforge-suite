# Brief para o agente BassForge — Pacote de construção completo

**De:** auditoria externa do export `bassforge-project/v1`  
**Projeto de referência:** `BassForge_Projeto_Oversound_18_SUB_800_XT_18_800W_.json`  
**Data:** 2026-11-22  
**Objetivo do usuário:** o fluxo Salvar/Abrir JSON + WoodLock deve chegar a um **arquivo de obra** que uma pessoa monte a caixa **sem dificuldade de interpretação**. Escopo do entregável: **driver + gráficos acústicos + MDF + plano de corte (incl. dutos)**. Sem acabamento, verniz, cola, parafusos, elétrica ou DSP.

Trate este brief como especificação de produto. Avalie e implemente no `index.html` / schema; não ignore os gaps.

---

## 1. Veredito da auditoria (estado atual)

O `.json` `bassforge-project/v1` **restaura estado da UI**. **Não é** um pacote de construção completo.

| Capacidade | Situação |
|------------|----------|
| Simulação acústica (gráficos) | Entradas T/S + caixa bastam para **regenerar** no app; gráficos **não** vão no arquivo |
| Dimensões de caixa | WoodLock **calcula** A/B → C, F, E e tabela de peças **só na UI** |
| Anticolisão / medidas impossíveis | **Não há** validação real de flange/recorte + dutos no baffle |
| Plano de corte simples + detalhado | Tabela parcial na UI; **sem** nesting, furação, Lv como peça, export congelado |
| Arquivo final montável por leigo | **Inexistente** (falta PDF/HTML/Markdown de obra) |

---

## 2. Caso de teste que expõe o problema

Arquivo: projeto Oversound **18″** SUB 800 XT, bass-reflex, AutoTune, HPF 33 Hz.

Campos relevantes salvos:

- `tsDia`: **"15"** (inconsistente com o nome 18″ e com Sd)
- `tsSd`: **1186** cm² → Ø pistão ≈ **38,9 cm** (perfil de **18″**, não 15″)
- WoodLock: `wlShape=rectangular`, `wlThickness=18`, `wlWidthA=800`, `wlHeightB=450`, `wlBattens=4`
- Dutos: `portType=round`, `numDucts=2`, `ductDia=6` (pol), `ductThick=1.5` (mm)
- Acústica: `vbInput=130`, `fbInput≈44.62`, T/S completo

Valores **derivados** pelo motor atual (não persistidos no JSON):

- `Lv` ≈ **25,45 cm** (fórmula BassForge / `computePortGeometry`)
- `Vduto` ≈ **9,73 L**
- Volume bruto ≈ **150,35 L** → profundidade interna **C ≈ 418 mm**
- Externos **F×E ≈ 836×486 mm**
- Comprimento do duto **cabe** em C (ok); o problema é o **frontal**

**Bloqueio geométrico:**

1. Altura interna **B = 450 mm** tipicamente **não comporta flange de 18″** (OD ~465–480 mm).
2. Com 18″ + **2 dutos Ø ~152 mm** no mesmo baffle, sem layout de furos, o empacotamento **não é confiável**.
3. O canvas WoodLock desenha **cones ilustrativos**; **não** posiciona furos de driver/dutos nem checa colisão/borda.

Conclusão do caso: o projeto abre e “parece ok” na UI, mas **pode gerar obra impossível** se alguém cortar MDF a partir das cotas atuais sem auditoria humana.

---

## 3. O que o usuário considera “completo”

Um único artefato exportável (preferência: **HTML/PDF imprimível**; JSON de estado pode continuar existindo à parte) contendo **somente**:

1. **Identificação do driver** + T/S usados na simulação  
2. **Gráficos acústicos congelados** (pelo menos SPL, excursão/Xmax, impedância; idealmente os principais já existentes no simulador)  
3. **Cotas internas/externas** da caixa (A, B, C/D, F, E, espessura)  
4. **Plano de corte MDF** simples (lista de peças L×A×esp.×qtd + rótulo) e detalhado o bastante para montar sem adivinhar  
5. **Dutos** (qtd, Ø interno/externo, **comprimento cortado Lv**, material tubo se aplicável) + **furação no baffle** com coordenadas  
6. **Checagens de viabilidade** já resolvidas (ou bloqueio de export se falhar)

Fora de escopo: acabamento, lista de ferragens, elétrica, amp, cabos, HPF/DSP como “peça de obra” (HPF pode aparecer só como nota nos gráficos, se útil).

---

## 4. Gaps de produto a fechar (prioridade)

### P0 — Segurança geométrica (não exportar obra inválida)

Implementar validador de baffle/caixa **antes** de liberar plano de corte / pacote de obra:

- Usar **diâmetro nominal** consistente (`tsDia`) + **Sd** + (se possível) Ø de recorte / Ø de flange — se não houver flange no schema, estimar com margem documentada e exigir confirmação.
- Checar: flange/recorte + margem mínima vs A×B.
- Checar: cada duto (Ø furo + margem) vs espaço restante, borda e entre si.
- Checar: `Lv` + folga vs profundidade útil C (e tipologia de montagem do duto).
- Checar inconsistências óbvias (ex.: nome/preset 18″ com `tsDia=15`, ou Sd incompatível com polegadas).
- UI: issues `critical`/`warn` no WoodLock (não só telemetria de duto acústico).
- **Bloquear** “Exportar pacote de construção” se houver `critical`.

### P0 — Persistência do que hoje só existe na UI

Estender `bassforge-project/v1` **ou** criar schema irmão `bassforge-buildpack/v1` com snapshot congelado:

- Resultados-chave: Fb, F3, Lv, Sp, Vduto, Vbruto, C/D, F/E, alertas
- Lista de peças MDF (nome, qtd, w, h, espessura, chanfro, nota de montagem)
- Peças de duto (qtd, Ø, Lv cortado)
- Sarrafos como peças (hoje só `wlBattens` count — falta L×seção no cut sheet)
- Layout de furação do baffle (centros X/Y, Ø)
- Metadados dos gráficos (ou PNG embutido/base64 / links gerados no export HTML)

O JSON de **estado editável** pode continuar; o de **obra** deve ser reproduzível sem reabrir a sessão.

### P1 — Plano de corte “sem interpretação”

- Tabela atual (tampo, base, frontal, traseiro, laterais embutidas) é um começo; completar:
  - rótulos de orientação (FRENTE / CIMA / LADO ESQ/DIR)
  - furos no frontal (driver + N dutos) com cotas a partir de uma origem definida
  - comprimento dos dutos como linha de BOM
  - sarrafos dimensionados
- Nesting em chapa padronizada (ex. 2750×1840) é desejável; se não entrar agora, no mínimo área total + aviso de quantas chapas estimadas.
- Export **HTML único imprimível** (offline) com: resumo + gráficos + cotas + cut list + furação. PDF opcional depois.

### P1 — Blueprint real, não só ilustrativo

- `drawWoodlockBlueprint` deve desenhar **recortes reais** (driver + dutos) nas posições validadas, não só arcos decorativos.
- Vista frontal com cotas de furação; vista lateral com Lv vs C.

### P2 — Qualidade do schema / preset

- Corrigir/propagar `tsDia` a partir do banco/preset (caso Oversound 18″).
- Garantir que Salvar Projeto não persista estado geometricamente crítico sem flags de validação.

---

## 5. Critério de aceite (definição de pronto)

Uma pessoa **sem** abrir o simulador consegue, só com o arquivo de obra:

1. Conferir driver e ver os gráficos da sintonia escolhida  
2. Cortar todas as peças de MDF pelas cotas listadas  
3. Furar o baffle nos centros indicados (driver + dutos)  
4. Cortar os dutos no comprimento Lv indicado  
5. Montar na topologia “laterais embutidas” sem inventar medida  

E o app **recusa** exportar se flange/dutos não cabem (caso B=450 mm + 18″ + 2×6″ deve falhar ou exigir redesenho).

Caso de regressão obrigatório: o JSON Oversound 18″ atual **não** deve passar no validador sem correção de geometria/`tsDia`.

---

## 6. Referências de código (repo atual)

- Schema save/load: `bassforge-project/v1` em `index.html` (~save/load fields)
- Portos: `computePortGeometry`, telemetria em `recalculate`
- Marcenaria: `updateWoodlock`, `drawWoodlockBlueprint`, `#cutSheetTableBody`
- Gap explícito: cones no baffle são ilustrativos (`subRadius = min(cellW,cellH)*0.34`); sem furos de duto no canvas

---

## 7. Pedido ao agente

1. Confirmar entendimento deste brief com o usuário do BassForge.  
2. Implementar **validador geométrico P0** + **export de pacote de construção** (HTML) cobrindo o critério da §5.  
3. Usar o JSON Oversound como fixture de teste (deve falhar validação até corrigir cotas/`tsDia`).  
4. Não expandir escopo para elétrica/acabamento neste entregável.

**Resultado bom:** PR/diff no kit BassForge com validação + export de obra; fixture documentada; README atualizado em 3–5 linhas sobre “Exportar pacote de construção”.
