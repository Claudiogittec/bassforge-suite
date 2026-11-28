# Brief — Autofix geométrico & piso mínimo seguro

**Para:** agente BassForge (`BassForge_Kit_Oficial`)  
**De:** usuário + auditoria externa  
**Data:** 2026-11-22  
**Contexto:** o pacote de obra HTML do Oversound 18″ foi **aceito** no critério driver + gráficos + MDF + corte + dutos. Próximo salto de produto.

Trate este arquivo como especificação. Confirme entendimento com o usuário antes de um redesign grande; depois implemente.

---

## 1. Objetivo

O simulador deve ficar **inteligente o suficiente** para:

1. **Verificar** se a caixa física é possível para o driver + dutos escolhidos.  
2. **Corrigir automaticamente** o que estiver abaixo do mínimo aplicável (ou impossível).  
3. Assim, **qualquer driver/caixa** que o usuário escolher **já parte de um projeto fisicamente possível**.  
4. Depois o usuário **ajusta à vontade**, com a **segurança de nada ficar menor que o mínimo aplicável** (piso / clamp / “não deixa descer”).

Validar + bloquear export (P0 atual) **permanece**. Agora entra a camada **auto-sanear + proteger edição**.

---

## 2. Comportamento desejado

### 2.1 Ao carregar driver / mudar topologia / Nº drivers / tipo de duto

Rodar o validador. Se houver `critical` (ou layout inviável):

- **Autofix** das cotas WoodLock (e, se necessário, arranjo de furos / nº ou Ø de duto **só com aviso explícito**).
- Preferência de correção (nesta ordem, salvo melhor heurística documentada):
  1. Aumentar **B** (altura) até caber flange + margem mínima  
  2. Aumentar **A** (largura) até caber driver(s) + dutos + gaps  
  3. Reposicionar furos no baffle (mantendo A×B se já der)  
  4. Ajustar profundidade **C** indiretamente via volume bruto / aviso se `Lv` + folga traseira mínima não couber  
  5. Só então sugerir reduzir área de duto / Nº dutos (nunca silencioso — pedir ou banner “corrigido: …”)

- Banner claro, ex.:  
  `🔧 Projeto ajustado automaticamente: B 450→490 mm; layout de dutos recalculado. Motivo: flange 18″.`

- Projeto resultante deve abrir com `validation.valid === true` (ou só `warn`, nunca `critical` oculto).

### 2.2 Enquanto o usuário edita (piso mínimo)

Para cada grandeza crítica, definir **mínimo aplicável** derivado do estado atual (driver, N, dutos, espessura, Vb/Fb/Lv):

| Grandeza | Piso (conceito) |
|----------|------------------|
| `wlHeightB` | ≥ flange×rows + gaps + margem borda |
| `wlWidthA` | ≥ colunas de drivers + dutos + gaps + margem |
| Profundidade útil C | ≥ Lv + folga traseira mínima (ou warn forte se só o “ideal” falhar) |
| Gaps entre furos | ≥ soma de raios (flange/recorte) + folga |
| Margem borda | ≥ valor documentado (ex. 10 mm) |

Na UI:

- Inputs não aceitam valor **abaixo do piso** (clamp ao blur/input + feedback).  
- Ou permitem digitar, mas **rebotam** para o mínimo com toast: `Mínimo para este driver/duto: B ≥ 488 mm`.  
- Slider/range, se existir, usa o mesmo `min` dinâmico.  
- Export de obra continua **bloqueado** se por qualquer race ficar `critical`.

### 2.3 O que NÃO fazer no autofix (sem confirmação)

- Mudar Vb/Fb/T/S do driver sem o usuário pedir (acústica é escolha; geometria é restrição).  
- Trocar topologia.  
- Remover dutos / mudar Ø silenciosamente.  
- Inventar acabamento/elétrica.

Exceção: se o volume bruto mudar **só** porque A/B/C/travas/duto mudaram para caber, atualizar telemetria WoodLock normalmente; se Vb útil ficar inconsistente, **avisar** e oferecer “manter Vb (ajusta C)” vs “manter C (ajusta Vb)” — default: **manter Vb útil** e recalcular C (comportamento atual do WoodLock).

---

## 3. Critério de aceite

1. Carregar o fixture Oversound com B=450 (inválido) → app **corrige sozinho** para geometria válida e mostra o que mudou.  
2. Usuário tenta baixar B abaixo do piso → **não gruda** valor inválido; explica o mínimo.  
3. Trocar para um 12″ / 15″ / outro preset → cotas/layout **re-sanam** sem critical residual.  
4. Pacote HTML de obra só exporta com geometria válida (já existe).  
5. Nenhuma regressão: validador + blueprint + cut list + gabarito continuam coerentes com as cotas autofixadas.

---

## 4. Feedback do HTML aceito (contexto, não reabrir)

Arquivo auditado: `BassForge_Obra_Oversound_18_SUB_800_XT_18_800W_Bass.html`  
Aceito para obra. Polimentos opcionais (não bloqueiam este brief):

- Unificar Lv 254 vs 255 mm no texto  
- Legendas dos gráficos em pt-BR amigável  
- Flange estimado: manter aviso de conferir datasheet  
- Folga traseira &lt; ideal: já aparece como warn — ok  

---

## 5. Pedido ao agente

1. Confirmar este brief com o usuário em 2–3 frases.  
2. Implementar **autofix na carga/mudança de driver** + **pisos dinâmicos na edição** WoodLock.  
3. Documentar no README em poucas linhas: “Projeto sempre parte válido; cotas não descem abaixo do mínimo do driver/duto.”  
4. Fixture de teste: Oversound inválido (B=450) deve ser sanado automaticamente nos testes/`guardian` se houver.

**Resultado bom:** qualquer combinação driver×caixa abre montável; o usuário só afina para cima/lado com rede de segurança.
