# Feedback de teste — Validador P0 (2026-11-22 ~13:19)

**Para:** agente BassForge (`BassForge_Kit_Oficial`)  
**De:** auditoria externa do export do usuário  
**Arquivo testado:** `C:\Users\Dinalli\Downloads\BassForge_Projeto_Oversound_18_SUB_800_XT_18_800W_ (1).json`  
**Contexto:** resposta ao `BRIEF_AGENTE_PACOTE_CONSTRUCAO.md`

Trate como feedback de aceite parcial. Continue o trabalho; não reabra o brief do zero.

---

## Resultado do teste

**P0 (validador geométrico): APROVADO no caso de regressão.**

O projeto Oversound 18″ com `A×B = 800×450` foi salvo com:

```json
"validation": {
  "valid": false,
  "criticalCount": 2,
  "warnCount": 0,
  "issues": [
    {
      "level": "critical",
      "code": "DRIVER_HEIGHT_FIT",
      "msg": "Altura interna B = 450 mm não comporta flange estimado de 18″ (Ø flange ≈ 468 mm, recorte 422 mm). Aumente B para ≥ 488 mm."
    },
    {
      "level": "critical",
      "code": "BAFFLE_BORDER_OVERFLOW",
      "msg": "Um ou mais recortes/flanges ultrapassam o vão interno A×B (800×450 mm). Sugestão: A ≥ 668 mm e B ≥ 488 mm."
    },
    {
      "level": "ok",
      "code": "FLANGE_ESTIMATED",
      "msg": "Recorte (422 mm) e flange (468 mm) estimados para 18″ — confirme no datasheet físico antes de furar."
    }
  ]
}
```

### Correções já observadas vs JSON antigo
| Item | Antes | Agora | Status |
|------|--------|--------|--------|
| `tsDia` | `"15"` | `"18"` | OK |
| Bloco `validation` no save | ausente | presente | OK |
| Caso B=450 + 18″ + 2×6″ | passava “silencioso” | `valid: false`, 2 critical | OK |
| Bloqueio de export de obra com critical | esperado | confirmar UX com usuário se ainda não testou o HTML | — |

---

## O que ainda NÃO foi aceito

Este arquivo continua `bassforge-project/v1` (estado + validação). **Ainda não é** o entregável completo do brief:

- Pacote de obra HTML imprimível com gráficos congelados + cotas + plano de corte + furação + dutos (`Lv`)
- Schema/export `bassforge-buildpack/v1` auditado em um caso **válido** (`valid: true`)

Com critical, o bloqueio de export é o comportamento correto — por isso o próximo teste precisa de geometria corrigida.

---

## Próximo teste pedido ao usuário / agente

1. Ajustar WoodLock até `validation.valid === true` (mínimo sugerido pelo validador: **B ≥ 488 mm**; revisar A/layout se os 2 dutos Ø6″ ainda colidirem).
2. Exportar **Pacote de Construção (HTML)** e, se disponível, **BuildPack (.json)**.
3. Entregar esses arquivos para auditoria externa do critério de aceite §5 do brief:
   - leigo monta só com o arquivo (driver + gráficos + MDF + corte + dutos)
   - sem inventar medida / sem interpretação ambígua

---

## Pedido ao agente

1. Confirmar com o usuário que o bloqueio de export com critical está claro na UI.  
2. Não mexer em elétrica/acabamento neste ciclo.  
3. Quando o usuário tiver geometria válida, garantir que o HTML de obra saia completo (gráficos + cut list + gabarito de furos + Lv).  
4. Responder neste chat do BassForge que leu este `FEEDBACK_TESTE_VALIDADOR_P0.md` e qual o próximo passo concreto no código (se ainda faltar algo no export) ou no teste (se o export HTML já estiver pronto).
