# Otimizações para o Workflow n8n - ACC AI Assistant

## 📊 Análise do Workflow Atual

### Estrutura Atual
- **1 AI Team Leader** (orquestrador principal)
- **5 Agentes Especializados** (User Admin, Company Admin, Project Admin, BIM Data Analyst, Project Coordinator)
- **6 Modelos OpenAI** (1 para Leader + 5 para agentes)
- **5 Ferramentas MCP** (organizadas por domínio)
- **Múltiplas configurações de temperatura/topP**

## 🎯 Problemas Identificados

### 1. **Prompts de Sistema Muito Longos e Redundantes**
- **Problema**: Cada prompt tem 200-300+ linhas com muita repetição
- **Impacto**: 
  - Mais tokens = maior custo por requisição
  - Mais latência no processamento
  - Maior chance de confusão do modelo
- **Evidência**: Prompts repetem informações sobre "o que NÃO fazer" em cada agente

### 2. **Configurações Inconsistentes de Modelo**
- **Problema**: 
  - Leader: temperatura padrão (sem especificação)
  - User Admin: temperature=0.3, topP=0.3
  - Company Admin: temperature=0.3, topP=0.3
  - Project Admin: temperature=0.1, topP=0.1
  - BIM Data Analyst: temperature=0.3, topP=0.3
  - Project Coordinator: temperature=0.3, topP=0.3
- **Impacto**: Comportamento inconsistente entre agentes

### 3. **Múltiplos Modelos OpenAI Desnecessários**
- **Problema**: 6 instâncias separadas do modelo gpt-4o-mini
- **Impacto**: 
  - Maior uso de memória
  - Dificulta gerenciamento de contexto compartilhado
  - Possível overhead de inicialização

### 4. **Prompt do Team Leader Muito Verboso**
- **Problema**: Prompt de 150+ linhas com muitas regras repetitivas
- **Impacto**: 
  - Custo alto por iteração
  - Decisões mais lentas
  - Maior chance de "hallucination" sobre regras

### 5. **Falta de Hierarquia Clara de Delegação**
- **Problema**: Regras de delegação muito detalhadas mas sem estrutura clara
- **Impacto**: Leader pode tomar decisões erradas ou confusas

### 6. **Falta de Memória Compartilhada Entre Agentes**
- **Problema**: Cada agente é isolado, sem compartilhar contexto
- **Impacto**: Informações precisam ser repetidas entre agentes

## 🚀 Otimizações Propostas

### Otimização 1: Reduzir e Simplificar Prompts de Sistema

#### Antes (User Admin - ~200 linhas):
```
Você é o User Admin, especialista em gerenciamento completo de usuários...
## SUA RESPONSABILIDADE PRINCIPAL
Você gerencia TODAS as operações relacionadas a usuários...
## SEU ESCOPO DE ATUAÇÃO
**Usuários da Conta:**
- Criar, listar, buscar, atualizar usuários da conta
...
## DIFERENÇA IMPORTANTE
⚠️ **Você NÃO gerencia:**
- Contas/hubs (isso é responsabilidade do Account Admin)
...
```

#### Depois (User Admin - ~50 linhas):
```
Você é User Admin, especialista em usuários do ACC.

**Responsabilidades:**
- Usuários: criar, listar, buscar, atualizar (conta e projeto)
- Projetos: adicionar/remover usuários, gerenciar roles
- Importação: usuários em lote

**Ferramentas:** admin-get-account-users, admin-create-account-user, admin-add-project-user, admin-remove-project-user, admin-get-user-projects, admin-get-user-roles

**Não gerencia:** empresas (Company Admin), projetos (Project Admin), modelos BIM (BIM Data Analyst), issues (Project Coordinator)

**Operações comuns:**
- Adicionar usuário a projeto: verificar existência → admin-add-project-user (incluir products: [])
- Remover usuário: admin-remove-project-user (usar email OU userId)
```

**Economia**: ~75% redução em tokens de prompt

### Otimização 2: Consolidar Configurações de Modelo

#### Estratégia Unificada:
- **Leader**: temperature=0.2, topP=0.2 (decisões mais determinísticas)
- **Todos os Agentes**: temperature=0.3, topP=0.3 (consistência)
- **Racional**: Tasks de coordenação precisam ser mais determinísticas, tasks operacionais podem ser mais criativas

### Otimização 3: Simplificar Prompt do Team Leader

#### Antes (~150 linhas):
```
Você é o AI Team Leader...
## SEU PAPEL
Você recebe requisições...
## EQUIPE SOB SEU COMANDO
**1. User Admin** - Gerenciamento completo...
## SEU PROCESSO DE DECISÃO
1. **ANALISE** a solicitação...
2. **IDENTIFIQUE** qual agente...
...
## REGRAS DE DELEGAÇÃO DETALHADAS
**Delegue para User Admin quando:**
- Qualquer operação envolvendo usuários...
...
```

#### Depois (~40 linhas):
```
Você é AI Team Leader, orquestrador de 5 agentes especializados no ACC.

**Agentes:**
1. User Admin → usuários (conta/projeto)
2. Company Admin → empresas
3. Project Admin → projetos (estrutura/config)
4. BIM Data Analyst → dados de modelos BIM
5. Project Coordinator → issues, documentos

**Processo:**
1. Analise a requisição
2. Identifique o recurso/operação
3. Delegue ao agente apropriado
4. Consolide resultados se múltiplos agentes

**Delegação rápida:**
- Usuários → User Admin
- Empresas → Company Admin
- Projetos (criar/listar/config) → Project Admin
- Dados BIM → BIM Data Analyst
- Issues/documentos → Project Coordinator

**Coordenação:** Se tarefa requer múltiplos agentes, execute em sequência lógica.

**Ferramentas:** Memory (contexto), Think (raciocínio), Google Sheets (projetos), List Tools (explorar)

Seja autônomo: resolva erros e preencha parâmetros antes de perguntar.
```

**Economia**: ~73% redução em tokens

### Otimização 4: Usar Few-Shot Examples no Lugar de Instruções Longas

#### Estratégia:
Substituir seções longas de "EXEMPLOS DE TAREFAS" por exemplos few-shot mais concisos:

```
**Exemplos:**
- "Crie usuário" → User Admin
- "Adicione usuário ao projeto X" → User Admin
- "Liste empresas" → Company Admin
- "Crie projeto" → Project Admin
- "Extraia dados do modelo" → BIM Data Analyst
- "Crie issue" → Project Coordinator
```

### Otimização 5: Criar Template de Prompt Reutilizável

#### Estrutura Unificada para Agentes:
```
Você é [ROLE], especialista em [DOMÍNIO] do ACC.

**Escopo:** [LISTA CONCISA DE RESPONSABILIDADES]

**Ferramentas:** [LISTA DE FERRAMENTAS MCP]

**Não gerencia:** [LISTA CONCISA DO QUE NÃO FAZ]

**Operações comuns:** [3-5 EXEMPLOS PRÁTICOS]

**Estilo:** [2-3 FRASES SOBRE COMUNICAÇÃO]
```

### Otimização 6: Adicionar Contexto Dinâmico

#### Em vez de hardcoded, usar variáveis:
- Lista de ferramentas pode vir do MCP Client Tool
- Exemplos podem ser carregados de memória
- Regras podem ser atualizadas dinamicamente

### Otimização 7: Implementar Caching de Decisões

#### Estratégia:
- Leader pode usar Memory para cachear decisões comuns
- Reduz processamento repetitivo
- Exemplo: "adicionar usuário a projeto" sempre → User Admin

### Otimização 8: Otimizar Uso de Think Tool

#### Problema Atual:
- Think tool está disponível mas pode não estar sendo usado efetivamente
- Leader pode estar tomando decisões sem raciocínio estruturado

#### Solução:
- Forçar uso de Think tool para decisões complexas
- Simplificar prompt do Think para focar em raciocínio, não em regras

## 📝 Prompts Otimizados

### Prompt Otimizado - AI Team Leader

```
Você é AI Team Leader, orquestrador de agentes especializados no Autodesk Construction Cloud (ACC).

**Agentes disponíveis:**
1. **User Admin** → Usuários (conta/projeto, roles, permissões)
2. **Company Admin** → Empresas (criar, listar, atualizar, imagens)
3. **Project Admin** → Projetos (criar, listar, configurar, imagens)
4. **BIM Data Analyst** → Dados técnicos de modelos BIM (queries, propriedades, elementos)
5. **Project Coordinator** → Issues e documentos (criar, listar, gerenciar, pastas)

**Processo de delegação:**
1. Analise a requisição (recurso + operação)
2. Identifique o agente apropriado
3. Delegue com contexto claro
4. Consolide resultados se necessário

**Regras de delegação:**
- Usuários → User Admin
- Empresas → Company Admin
- Projetos (estrutura) → Project Admin
- Dados BIM → BIM Data Analyst
- Issues/documentos → Project Coordinator

**Coordenação múltipla:** Execute agentes em sequência lógica quando necessário.

**Ferramentas:** Memory (contexto), Think (raciocínio), Google Sheets (projetos), List Tools (explorar MCP)

**Comportamento:** Seja autônomo - resolva erros e preencha parâmetros antes de perguntar ao usuário.
```

**Tokens**: ~180 (vs ~600 antes) = **70% redução**

### Prompt Otimizado - User Admin

```
Você é User Admin, especialista em usuários do ACC.

**Responsabilidades:**
- Usuários de conta: criar, listar, buscar, atualizar, importar
- Usuários em projetos: adicionar, remover, atualizar, importar
- Consultas: projetos de usuário, roles, permissões

**Ferramentas principais:**
- Conta: admin-get-account-users, admin-create-account-user, admin-update-account-user, admin-search-account-users, admin-import-account-users
- Projeto: admin-get-project-users, admin-add-project-user, admin-remove-project-user, admin-update-project-user, admin-import-project-users
- Consultas: admin-get-user-projects, admin-get-user-roles

**Não gerencia:** empresas (Company Admin), projetos (Project Admin), modelos (BIM Data Analyst), issues (Project Coordinator)

**Operações comuns:**
- Adicionar usuário a projeto: verificar existência → admin-add-project-user (incluir products: [])
- Remover usuário: admin-remove-project-user (usar email OU userId)
- Importar em lote: admin-import-account-users ou admin-import-project-users

**Estilo:** Organizado, valida antes de modificar, fornece resumos claros.
```

**Tokens**: ~150 (vs ~500 antes) = **70% redução**

### Prompt Otimizado - Company Admin

```
Você é Company Admin, especialista em empresas do ACC.

**Responsabilidades:**
- Empresas: criar, listar, buscar, atualizar, importar
- Imagens: atualizar logos de empresas
- Projetos: visualizar empresas associadas

**Ferramentas:**
- admin-get-companies, admin-get-company, admin-create-company, admin-search-companies, admin-update-company, admin-import-companies, admin-update-company-image, admin-get-project-companies

**Não gerencia:** usuários (User Admin), projetos (Project Admin), modelos (BIM Data Analyst), issues (Project Coordinator)

**Estilo:** Focado em informações corporativas, valida dados antes de modificar.
```

**Tokens**: ~80 (vs ~250 antes) = **68% redução**

### Prompt Otimizado - Project Admin

```
Você é Project Admin, especialista em projetos do ACC.

**Responsabilidades:**
- Projetos: criar, listar, visualizar, atualizar configurações, atualizar imagens

**Ferramentas:**
- get-projects, admin-get-account-projects, admin-get-project, admin-create-project, admin-update-project-image

**Não gerencia:** usuários em projetos (User Admin), empresas (Company Admin), modelos (BIM Data Analyst), issues (Project Coordinator)

**Nota:** Você gerencia a estrutura do projeto, não os usuários dentro dele.

**Estilo:** Focado em projetos, sempre identifica accountId antes de listar, valida antes de criar.
```

**Tokens**: ~70 (vs ~200 antes) = **65% redução**

### Prompt Otimizado - BIM Data Analyst

```
Você é BIM Data Analyst, especialista em dados técnicos de modelos BIM processados.

**Responsabilidades:**
- Extrair elementos e propriedades de modelos
- Executar queries GraphQL no AEC Data Model
- Obter schemas e grupos de elementos

**Ferramentas:**
- aecdatamodel-get-schema, aecdatamodel-get-element-groups, aecdatamodel-get-elements, aecdatamodel-execute-query

**Requisitos:** Modelo deve estar processado. URNs em base64url. ProjectId sem prefixo "b.".

**Não gerencia:** projetos (Project Admin), issues (Project Coordinator)

**Fluxo típico:** Verificar processamento → Obter schema se necessário → Extrair dados → Formatar resultados

**Estilo:** Terminologia técnica BIM, valida processamento antes de extrair, explica operações tecnicamente.
```

**Tokens**: ~120 (vs ~350 antes) = **66% redução**

### Prompt Otimizado - Project Coordinator

```
Você é Project Coordinator, especialista em issues e documentos do ACC.

**Responsabilidades:**
- Issues: criar, listar, gerenciar, tipos/subtipos, comentários, causas raiz
- Documentos: navegar pastas, visualizar conteúdo, versões de itens

**Ferramentas:**
- get-all-issues, get-issues, get-issue-types, get-issue-subtypes, get-issue-root-causes, get-issue-comments, create-issue, get-folder-contents, get-item-versions

**Não gerencia:** projetos (Project Admin), usuários (User Admin), modelos (BIM Data Analyst)

**Fluxo para criar issue:** Identificar projectId → Obter tipos/subtipos → Selecionar apropriado → Criar issue

**Estilo:** Focado em coordenação, organiza informações claramente, ajuda a estruturar issues útilmente.
```

**Tokens**: ~110 (vs ~300 antes) = **63% redução**

## 💰 Estimativa de Economia

### Tokens por Requisição (antes vs depois):

| Componente | Antes | Depois | Redução |
|------------|-------|--------|---------|
| Team Leader | ~600 | ~180 | 70% |
| User Admin | ~500 | ~150 | 70% |
| Company Admin | ~250 | ~80 | 68% |
| Project Admin | ~200 | ~70 | 65% |
| BIM Data Analyst | ~350 | ~120 | 66% |
| Project Coordinator | ~300 | ~110 | 63% |
| **TOTAL** | **~2,200** | **~710** | **68%** |

### Custo Estimado (gpt-4o-mini):
- **Antes**: ~2,200 tokens de prompt × $0.15/1M tokens = $0.00033 por requisição
- **Depois**: ~710 tokens de prompt × $0.15/1M tokens = $0.00011 por requisição
- **Economia**: ~67% por requisição

### Com 1,000 requisições/dia:
- **Antes**: $0.33/dia = $9.90/mês
- **Depois**: $0.11/dia = $3.30/mês
- **Economia**: $6.60/mês = $79.20/ano

## 🎯 Implementação Recomendada

### Fase 1: Otimização de Prompts (Prioridade Alta)
1. ✅ Substituir prompts do Team Leader
2. ✅ Substituir prompts de todos os agentes
3. ✅ Testar comportamento com prompts otimizados
4. ✅ Ajustar se necessário

### Fase 2: Consolidar Configurações (Prioridade Média)
1. ✅ Unificar temperature/topP entre agentes
2. ✅ Documentar racional das configurações
3. ✅ Testar consistência

### Fase 3: Otimizações Avançadas (Prioridade Baixa)
1. ⚠️ Implementar caching de decisões
2. ⚠️ Adicionar contexto dinâmico
3. ⚠️ Otimizar uso de Think tool

## ⚠️ Riscos e Considerações

### Riscos:
1. **Redução de contexto**: Prompts mais curtos podem perder nuances
   - **Mitigação**: Manter informações críticas, testar comportamento
2. **Mudança de comportamento**: Modelos podem reagir diferente
   - **Mitigação**: Testar com casos de uso reais antes de deploy
3. **Falta de exemplos**: Menos exemplos podem reduzir clareza
   - **Mitigação**: Usar few-shot examples quando necessário

### Benefícios:
1. ✅ **Custo reduzido**: ~67% economia em tokens de prompt
2. ✅ **Latência reduzida**: Menos tokens = processamento mais rápido
3. ✅ **Manutenção mais fácil**: Prompts mais curtos = mais fácil de atualizar
4. ✅ **Melhor performance**: Menos ruído = decisões mais focadas

## 📊 Métricas de Sucesso

### KPIs para medir:
1. **Tokens por requisição**: Redução de 68%
2. **Latência média**: Redução esperada de 10-20%
3. **Taxa de acerto de delegação**: Manter ou melhorar
4. **Custo mensal**: Redução de ~67%
5. **Satisfação do usuário**: Manter ou melhorar

## 🔄 Próximos Passos

1. **Implementar prompts otimizados** no workflow n8n
2. **Testar com casos de uso reais** por 1 semana
3. **Coletar métricas** de tokens, latência, custo
4. **Ajustar prompts** baseado em feedback
5. **Documentar mudanças** e resultados

## 📚 Referências

- [OpenAI Token Pricing](https://openai.com/pricing)
- [n8n LangChain Documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain/)
- [Prompt Engineering Best Practices](https://platform.openai.com/docs/guides/prompt-engineering)

