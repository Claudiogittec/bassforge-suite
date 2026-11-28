# BASSFORGE — ESPECIFICAÇÃO DE ARQUITETURA DOS GRÁFICOS

**Para:** agente Antigravity / BassForge (`BassForge_Kit_Oficial`)  
**Tipo:** especificação técnica de arquitetura (não é lista solta de patches)  
**Data:** 2026-11-22  

## Instrução operacional (ler antes de tudo)

1. **Não comece a programar imediatamente.**  
2. **Analise a arquitetura existente** (Physics Core, renderização dos 13 gráficos, modelos ambientais já presentes) **antes** de modificar qualquer coisa.  
3. **Preserve os cálculos aprovados.** Implemente **somente** a camada de organização, critérios de interpretação e visualização.  
4. Entregue primeiro o relatório da **FASE 1 + FASE 2** e **aguarde aprovação explícita** do usuário antes da FASE 4 (implementação).  
5. Em dúvida entre “mostrar um gráfico bonito” e “só mostrar o que a física calcula”: **não invente grandeza**.

### Referências técnicas de sala e cabine (para a auditoria)

- Modelos de domínio público para acoplamento acústico de sala (Waterhouse / modos axiais) e pressurização de cabine veicular.

Usar na FASE 1 como **material de referência** (grandezas físicas modeladas em sala/cabine). **Não** copiar cegamente para a UI do BassForge. Se o BassForge ainda não tiver modelo equivalente, classificar a grandeza como **ainda não implementada** (ver § ressalva).

---

## Architectural & Automotive — Analysis and Visualization Engine

### 1. OBJETIVO

Reestruturar a organização, hierarquia e apresentação dos 13 gráficos do BassForge, contemplando dois ambientes de aplicação:

- **ARCHITECTURAL:** caixas acústicas destinadas a salas residenciais, estúdios, auditórios e ambientes profissionais.
- **AUTOMOTIVE:** caixas acústicas destinadas a veículos e sistemas automotivos.

Os dois ambientes devem compartilhar o mesmo motor de cálculos físicos e eletroacústicos (**Physics Core**), mas apresentar diferentes prioridades de análise e interpretação dos resultados.

**IMPORTANTE:** Esta tarefa é uma reorganização arquitetural e visual. Não alterar fórmulas, algoritmos ou resultados físicos existentes sem uma justificativa técnica documentada.

---

### 2. PRINCÍPIO ARQUITETURAL

Implementar três camadas independentes:

1. **Physics Core:** responsável pelos cálculos físicos e eletroacústicos. Não deve depender do ambiente selecionado nem da interface.
2. **Analysis Engine:** responsável pela interpretação dos resultados, aplicação dos critérios específicos de cada ambiente e definição da ordem dos gráficos.
3. **Visualization Layer:** responsável pela apresentação dos gráficos, títulos, unidades, escalas, indicadores e organização visual.

A seleção Architectural ou Automotive deve modificar somente os critérios e a apresentação da análise, nunca duplicar o motor físico.

---

### 3. ORGANIZAÇÃO DOS GRÁFICOS

#### PERFIL ARCHITECTURAL

Prioridade: resposta acústica, fidelidade, comportamento temporal e integração com o ambiente.

Ordem proposta:

1. SPL in Room (dB-SPL)
2. Normalized Amplitude (dB)
3. Group Delay (ms)
4. Cone Excursion (mm)
5. Port Air Velocity (m/s)
6. Max Power (Watts RMS)
7. SPL Thermic (dB)
8. Vent SPL (dB-SPL)
9. Acoustic Phase (Degrees)
10. In Box Impedance (Ohms)
11. Free Air Impedance (Ohms)
12. Cone SPL (dB-SPL)
13. Room Gain (dB)

#### PERFIL AUTOMOTIVE

Prioridade: pressão sonora, aproveitamento da cabine, capacidade mecânica e limites operacionais.

Ordem proposta:

1. SPL in Car (dB-SPL)
2. Cabin Gain (dB)
3. Cone Excursion (mm)
4. Max Power (Watts RMS)
5. Port Air Velocity (m/s)
6. SPL Thermic (dB)
7. Vent SPL (dB-SPL)
8. Group Delay (ms)
9. Normalized Amplitude (dB)
10. Acoustic Phase (Degrees)
11. In Box Impedance (Ohms)
12. Free Air Impedance (Ohms)
13. Cone SPL (dB-SPL)

Observação: os nomes SPL in Room, Room Gain e Acoustic Phase devem ser utilizados somente se corresponderem a grandezas efetivamente calculadas pelo sistema. Não criar variáveis ou resultados fictícios para preencher os gráficos.

---

### 4. REGRAS DE INTERPRETAÇÃO FÍSICA

Os seguintes indicadores são restrições de engenharia e devem permanecer monitorados em ambos os ambientes:

- Cone Excursion: excursão em relação ao Xmax disponível.
- Port Air Velocity: velocidade do ar no duto e risco de turbulência.
- Max Power: potência admissível considerando os limites mecânicos e elétricos.
- SPL Thermic: comportamento relacionado à compressão térmica.

Não tratar esses indicadores como simples gráficos informativos. Quando os limites forem ultrapassados, apresentar alertas claros.

A hierarquia visual não pode reduzir a importância das restrições físicas.

---

### 5. DIFERENÇAS ENTRE OS AMBIENTES

**ARCHITECTURAL**

A análise ambiental deve considerar, quando houver dados suficientes:

- Dimensões da sala.
- Frequências modais.
- Posicionamento da caixa acústica.
- Posicionamento do ouvinte.
- Interação entre modos acústicos e resposta da caixa.
- Ganho de ambiente, somente quando houver um modelo físico definido.

**AUTOMOTIVE**

A análise automotiva deve considerar, quando houver dados suficientes:

- Volume e geometria da cabine.
- Acoplamento acústico da caixa com o habitáculo.
- Cabin Gain.
- Posicionamento da caixa.
- Transferência acústica da cabine.
- Frequências de ressonância do habitáculo.

Room Gain e Cabin Gain não são grandezas intercambiáveis. Não utilizar um como substituto do outro.

---

### 6. REQUISITOS DA INTERFACE

Implementar:

- Seletor de ambiente: Architectural / Automotive.
- Ordenação dinâmica dos gráficos.
- Títulos e unidades padronizados.
- Identificação visual de indicadores críticos.
- Escalas coerentes com cada grandeza.
- Preservação dos dados e resultados calculados.
- Layout responsivo.
- Possibilidade de expandir cada gráfico para análise individual.

A mudança de ambiente não deve reinicializar os parâmetros do projeto nem modificar os resultados físicos.

---

### 7. CONTRATOS E INTEGRIDADE DOS DADOS

Antes de implementar, identificar:

- Os 13 gráficos existentes.
- As funções responsáveis pelos cálculos.
- As fontes de dados de cada gráfico.
- As unidades utilizadas.
- Os modelos ambientais existentes.
- As dependências entre gráficos e simuladores.

Cada gráfico deve ter uma identificação estável, independente de sua posição na interface.

A ordenação deve ser controlada por configuração, e não pela alteração da lógica de cálculo.

Não criar uma segunda implementação de fórmulas já existentes.

---

### 8. PLANO DE EXECUÇÃO OBRIGATÓRIO

Seguir esta sequência:

**FASE 1 — AUDITORIA**

- Inspecionar a implementação atual.
- Mapear os 13 gráficos.
- Identificar cálculos reais e dados disponíveis.
- Verificar se Architectural e Automotive já possuem modelos ambientais.
- Comparar contra modelos físicos de sala e cabine (literatura de domínio público); documentar o que o BassForge já cobre vs. o que ainda não cobre.

**FASE 2 — PLANEJAMENTO**

- Apresentar a arquitetura proposta.
- Definir contratos de dados.
- Identificar diferenças entre os dois perfis.
- Apresentar riscos e dependências.
- Classificar cada slot da ordem proposta em: **calculada** | **estimada por modelo** | **ainda não implementada**.

**FASE 3 — TESTES**

Criar testes para verificar:

1. Os 13 gráficos continuam recebendo os mesmos dados.
2. A seleção Architectural altera somente a apresentação e os critérios correspondentes.
3. A seleção Automotive altera somente a apresentação e os critérios correspondentes.
4. A alternância entre ambientes não altera os resultados físicos.
5. Os indicadores de segurança funcionam nos dois ambientes.
6. Nenhum gráfico utiliza dados inexistentes ou unidades incompatíveis.
7. Os parâmetros do projeto permanecem preservados.

**FASE 4 — IMPLEMENTAÇÃO** *(somente após aprovação do usuário)*

- Desenvolver somente o módulo de organização e visualização.
- Não modificar módulos congelados do Physics Core.
- Não refatorar módulos não relacionados à tarefa.

**FASE 5 — AUDITORIA FINAL**

- Comparar resultados anteriores e posteriores.
- Executar testes automatizados.
- Verificar regressões.
- Documentar alterações e limitações.

---

### 9. CRITÉRIOS DE ACEITAÇÃO

A implementação somente será aprovada quando:

- Os dois ambientes estiverem funcionando.
- Os 13 gráficos estiverem presentes.
- Cada ambiente apresentar sua ordem específica.
- Os cálculos originais permanecerem inalterados.
- Os alertas físicos continuarem funcionando.
- Não existirem dados simulados ou inventados.
- A alternância entre ambientes não provocar regressões.
- Os testes forem aprovados.

---

### 10. INSTRUÇÃO FINAL

**Não comece a programar imediatamente.**

Primeiro faça a auditoria do projeto existente e apresente:

1. Arquitetura atual identificada.
2. Mapeamento dos 13 gráficos e suas respectivas fontes de dados.
3. Diferenças entre os modelos Architectural e Automotive existentes.
4. Plano de implementação.
5. Testes de validação.
6. Módulos que serão modificados e módulos que permanecerão congelados.

Aguarde aprovação antes de implementar.

O objetivo é transformar o BassForge em uma plataforma de análise eletroacústica com múltiplos ambientes de aplicação, mantendo rigor físico, modularidade, rastreabilidade e confiabilidade dos resultados.

---

## Ressalva obrigatória (não negociável)

**SPL in Room** e **Room Gain** não devem ser tratados como gráficos já existentes se o programa ainda não possui um modelo de propagação e interação com a sala.

O mesmo vale para o modelo de cabine automotiva completo (além do que já for comprovadamente calculado hoje, ex.: se `SPL in Car` / `Cabin Gain` já existirem no código com fonte de dados real).

O agente deve distinguir **três situações** para cada item da ordem proposta:

| Classe | Significado | Comportamento na UI |
|--------|-------------|---------------------|
| **Efetivamente calculada** | Série/dados já produzidos pelo Physics Core | Pode ocupar slot na ordem do perfil |
| **Estimada por modelo físico** | Há modelo documentado (sala/cabine) com hipóteses explícitas | Pode exibir com rótulo de modelo/hipótese |
| **Ainda não implementada** | Sem motor / sem dados | **Não** inventar curva; slot vazio, oculto, ou placeholder “não disponível” — nunca resultado fictício |

Isso evita interface visualmente convincente sem fundamentação física.

**Room Gain ≠ Cabin Gain.** Não usar um como substituto do outro.

---

## Recomendação de governança

1. **Aprovar a auditoria (FASE 1)** do agente.  
2. Revisar a arquitetura proposta (FASE 2).  
3. Liberar a implementação **de um módulo por vez** (Visualization / Analysis Engine), com Physics Core congelado.

---

## Entrega esperada AGORA (resposta neste chat)

Somente o relatório de auditoria + plano (§10), **sem diff de implementação**.  
Módulos congelados vs. tocáveis devem estar listados explicitamente.
