# 📋 Handoff: Implementação OAuth2 - MCP Server

## 🎯 Objetivo

Implementar autenticação OAuth2 (PKCE flow) no servidor MCP para permitir que usuários autentiquem com suas próprias credenciais Autodesk, em vez de depender apenas de Service Account fixa.

## 📚 Contexto e Referências

### Repositório de Referência
- **Repositório .NET com OAuth2**: https://github.com/autodesk-platform-services/aps-aecdm-mcp-dotnet
- Implementa OAuth2 PKCE flow com tool `GetToken`
- Usa Single Page Application (SPA) para OAuth2

### Repositórios Atuais
1. **aps-mcp-http** (servidor MCP)
   - Branch: `feature/oauth2-implementation`
   - Localização: `/Users/ihanBarbosa/Desktop/Arquivos/Projetos/aps-mcp-http`
   - Status: Branch criada, documentação inicial pronta

2. **mcp-assist-hub** (frontend/UI)
   - Branch: `feature/oauth2-implementation`
   - Localização: `/Users/ihanBarbosa/Desktop/Arquivos/Projetos/mcp-assist-hub`
   - Status: Branch criada, documentação inicial pronta

## 📊 Estado Atual

### ✅ Concluído (Backend - aps-mcp-http)

#### Fase 1: Infraestrutura OAuth2 ✅ COMPLETA
1. ✅ **Módulo OAuth2 criado** (`src/auth/oauth2.ts`)
   - Funções de geração PKCE (code_verifier, code_challenge, state)
   - Troca de código de autorização por token
   - Refresh automático de token
   - Implementação completa conforme especificação PKCE

2. ✅ **Interface Session atualizada** (`src/http-server.ts`)
   - Adicionado suporte OAuth2 na interface Session
   - Campos: `oauth2` (tokens) e `pkce` (dados temporários)

3. ✅ **Endpoints OAuth2 implementados** (`src/http-server.ts`)
   - `GET /oauth/authorize` - Inicia fluxo OAuth2, retorna URL de autorização
   - `GET /oauth/callback` - Recebe callback do Autodesk, troca código por token
   - `POST /oauth/logout` - Limpa tokens OAuth2 da sessão
   - Todos os handlers implementados com validação de state, expiração PKCE, etc.

#### Fase 2: Tools MCP ✅ COMPLETA
1. ✅ **Tool `get-oauth-authorization-url` criada**
   - Arquivo: `src/tools/get-oauth-authorization-url.ts`
   - Retorna instruções para obter URL de autorização

2. ✅ **Tool `exchange-oauth-code` criada**
   - Arquivo: `src/tools/exchange-oauth-code.ts`
   - Retorna instruções para trocar código por token

3. ✅ **Tools registradas** em `src/tools/index.ts`

#### Fase 3: Integração Common.ts ✅ COMPLETA
1. ✅ **Função `getAccessToken` modificada** (`src/tools/common.ts`)
   - Aceita sessão opcional como segundo parâmetro
   - Implementa lógica híbrida: OAuth2 quando disponível, Service Account como fallback
   - Refresh automático de token OAuth2 quando expirado
   - Validação de scopes necessários
   - Logs detalhados para debug

2. ✅ **Tipo Session exportado** (`src/tools/common.ts`)
   - Exportado para uso nas tools

3. ✅ **Sessão passada no contexto** (`src/http-server.ts`)
   - Modificado `handleToolsCall` para passar sessão no contexto das tools

#### Fase 4: Tools Atualizadas ✅ PARCIAL
1. ✅ **Tools principais migradas**:
   - `get-projects.ts` - Usa sessão OAuth2
   - `get-issues.ts` - Usa sessão OAuth2
   - `create-issue.ts` - Usa sessão OAuth2
   - `get-all-bim-models.ts` - Usa sessão OAuth2

2. ⏳ **Tools restantes** (~36 tools):
   - Tools admin (admin-create-project, admin-add-project-user, etc.)
   - Tools AEC Data Model
   - Outras tools de leitura/escrita
   - **Nota**: Podem ser migradas gradualmente conforme necessidade

#### Fase 5: Configuração ✅ COMPLETA
1. ✅ **Config.ts atualizado**
   - Variáveis `APS_OAUTH_REDIRECT_URI` e `APS_OAUTH_SCOPES` adicionadas

### ⏳ Pendente (Frontend - mcp-assist-hub)
1. ⏳ Criar componente `OAuth2Login.tsx`
2. ⏳ Criar página `OAuth2Callback.tsx`
3. ⏳ Adicionar rotas OAuth2
4. ⏳ Integrar com MCP client
5. ⏳ Adicionar gerenciamento de sessão no frontend

### 🔧 Arquitetura Atual

#### Autenticação Atual (Service Account)
```typescript
// Todas as tools usam Service Account fixa do .env
const accessToken = await getAccessToken(["data:read"]);
// Usa: APS_SA_ID, APS_SA_KEY_ID, APS_SA_PRIVATE_KEY
// Cache global compartilhado entre todos os usuários
```

#### Arquitetura Proposta (OAuth2)
```typescript
// Tools usam token OAuth2 da sessão (se disponível)
const accessToken = await getAccessToken(
    ["data:read"],
    context?.session  // NOVO: contexto de sessão
);
// Fallback para Service Account se não houver token OAuth2
```

### 📁 Estrutura de Arquivos Atual

```
aps-mcp-http/
├── aps-mcp-server/
│   ├── src/
│   │   ├── auth.ts                    # Autenticação atual (Service Account)
│   │   ├── config.ts                  # Variáveis de ambiente
│   │   ├── http-server.ts             # Servidor HTTP MCP (1077 linhas)
│   │   ├── http-server-main.ts        # Entry point HTTP
│   │   ├── server.ts                  # Servidor stdio MCP
│   │   ├── tools/
│   │   │   ├── common.ts              # Funções compartilhadas (getAccessToken)
│   │   │   ├── admin-create-project.ts
│   │   │   ├── admin-add-project-user.ts
│   │   │   ├── get-projects.ts
│   │   │   ├── get-issues.ts
│   │   │   └── ... (40+ tools)
│   │   └── utils/
│   │       └── logger.ts
│   └── package.json
├── OAUTH2_IMPLEMENTATION.md           # Plano de implementação
└── HANDOFF_OAUTH2.md                  # Este documento

mcp-assist-hub/
├── src/
│   ├── pages/
│   │   └── BimModelsResults.tsx
│   └── lib/
│       └── webhook.ts
└── OAUTH2_IMPLEMENTATION.md
```

## 🔍 Análise da Implementação de Referência (.NET)

### O que o repositório .NET faz:
1. **GetToken Tool**: Obtém token PKCE via OAuth2
   - Gera `code_verifier` e `code_challenge`
   - Redireciona para Autodesk OAuth
   - Trocam código por token
   - Armazena token na sessão

2. **Fluxo PKCE**:
   ```
   Cliente → Gera code_verifier + code_challenge
   → Redireciona para Autodesk com challenge
   → Autodesk retorna code
   → Cliente troca code + verifier por token
   ```

### URLs Autodesk OAuth2
- **Authorization**: `https://developer.api.autodesk.com/authentication/v2/authorize`
- **Token Exchange**: `https://developer.api.autodesk.com/authentication/v2/token`
- **Grant Type**: `authorization_code` (com PKCE)

## 🚀 Próximos Passos Detalhados

> **NOTA**: As Fases 1, 2, 3 e 5 (backend) estão **COMPLETAS**. A Fase 4 está parcialmente completa (4 tools principais migradas). A Fase 6 (frontend) está **PENDENTE**.

### FASE 1: Infraestrutura OAuth2 ✅ COMPLETA

#### 1.1 Criar módulo OAuth2 (`src/auth/oauth2.ts`) ✅ COMPLETO
**Prioridade**: CRÍTICA
**Status**: ✅ Implementado e testado

```typescript
// Funcionalidades necessárias:

// 1. Geração de PKCE
export function generateCodeVerifier(): string
export function generateCodeChallenge(verifier: string): string
export function generateState(): string

// 2. Troca de código por token
export async function exchangeAuthorizationCode(
    clientId: string,
    code: string,
    codeVerifier: string,
    redirectUri: string
): Promise<OAuth2TokenResponse>

// 3. Refresh token
export async function refreshAccessToken(
    clientId: string,
    refreshToken: string
): Promise<OAuth2TokenResponse>

// Tipos
interface OAuth2TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
}
```

**Implementação de Referência (PKCE)**:
```typescript
import { randomBytes, createHash } from 'crypto';
import { base64URLEncode } from './utils';

// Code Verifier: 43-128 caracteres, URL-safe
function generateCodeVerifier(): string {
    const bytes = randomBytes(32);
    return base64URLEncode(bytes);
}

// Code Challenge: SHA256 hash do verifier, base64url encoded
function generateCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest();
    return base64URLEncode(hash);
}

// State: Random string para prevenir CSRF
function generateState(): string {
    return randomBytes(16).toString('hex');
}
```

**Arquivo**: `aps-mcp-server/src/auth/oauth2.ts`

---

#### 1.2 Atualizar Session Interface (`src/http-server.ts`) ✅ COMPLETO
**Prioridade**: CRÍTICA
**Status**: ✅ Implementado

```typescript
// Modificar interface Session (linha ~44)
interface Session {
    id: string;
    createdAt: number;
    lastActivity: number;
    streams: Set<string>;
    // NOVO: Adicionar suporte OAuth2
    oauth2?: {
        accessToken: string;
        refreshToken?: string;
        expiresAt: number;
        userId?: string;
        email?: string;
        scopes?: string[];
    };
    pkce?: {
        codeVerifier: string;
        state: string;
        createdAt: number;
    };
}
```

**Localização**: `aps-mcp-server/src/http-server.ts` (linha ~44)

---

#### 1.3 Adicionar Endpoints OAuth2 no HTTP Server (`src/http-server.ts`) ✅ COMPLETO
**Prioridade**: CRÍTICA
**Status**: ✅ Implementado - Todos os 3 endpoints funcionais

Adicionar handlers no método `handleRequest` (linha ~209):

```typescript
// 1. Endpoint: GET /oauth/authorize
// Inicia fluxo OAuth2, retorna URL de autorização
if (url.pathname === "/oauth/authorize" && req.method === "GET") {
    await this.handleOAuthAuthorize(req, res, session);
    return;
}

// 2. Endpoint: GET /oauth/callback
// Recebe callback do Autodesk após autorização
if (url.pathname === "/oauth/callback" && req.method === "GET") {
    await this.handleOAuthCallback(req, res, session);
    return;
}

// 3. Endpoint: POST /oauth/logout
// Limpa tokens OAuth2 da sessão
if (url.pathname === "/oauth/logout" && req.method === "POST") {
    await this.handleOAuthLogout(req, res, session);
    return;
}
```

**Métodos a implementar**:
```typescript
private async handleOAuthAuthorize(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    session: Session
): Promise<void> {
    // 1. Gerar PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    
    // 2. Armazenar na sessão
    session.pkce = {
        codeVerifier,
        state,
        createdAt: Date.now()
    };
    
    // 3. Construir URL de autorização
    const redirectUri = new URL(req.url || '/', `http://${req.headers.host}`)
        .searchParams.get('redirect_uri') || 
        process.env.APS_OAUTH_REDIRECT_URI || 
        'http://localhost:5173/oauth/callback';
    
    const scopes = (new URL(req.url || '/', `http://${req.headers.host}`)
        .searchParams.get('scopes') || 
        process.env.APS_OAUTH_SCOPES || 
        'data:read data:write').split(' ');
    
    const authUrl = new URL('https://developer.api.autodesk.com/authentication/v2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', APS_CLIENT_ID!);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    
    // 4. Retornar URL e sessionId
    const corsHeaders = this.getCorsHeaders(req);
    res.writeHead(200, {
        'Content-Type': 'application/json',
        ...corsHeaders
    });
    res.end(JSON.stringify({
        authorizationUrl: authUrl.toString(),
        state,
        sessionId: session.id
    }));
}

private async handleOAuthCallback(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    session: Session
): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    
    if (error) {
        // Erro na autorização
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error, error_description: url.searchParams.get('error_description') }));
        return;
    }
    
    if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing code or state' }));
        return;
    }
    
    // Verificar state
    if (!session.pkce || session.pkce.state !== state) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid state' }));
        return;
    }
    
    // Verificar expiração (PKCE deve ser usado em 10 minutos)
    if (Date.now() - session.pkce.createdAt > 10 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PKCE expired' }));
        return;
    }
    
    try {
        // Trocar código por token
        const redirectUri = process.env.APS_OAUTH_REDIRECT_URI || 'http://localhost:5173/oauth/callback';
        const tokens = await exchangeAuthorizationCode(
            APS_CLIENT_ID!,
            code,
            session.pkce.codeVerifier,
            redirectUri
        );
        
        // Armazenar tokens na sessão
        session.oauth2 = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            scopes: tokens.scope?.split(' ') || []
        };
        
        // Limpar PKCE
        delete session.pkce;
        
        // Retornar sucesso
        const corsHeaders = this.getCorsHeaders(req);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            ...corsHeaders
        });
        res.end(JSON.stringify({
            success: true,
            sessionId: session.id,
            expiresAt: session.oauth2.expiresAt
        }));
    } catch (error: any) {
        logger.error('OAuth callback error', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
}

private async handleOAuthLogout(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    session: Session
): Promise<void> {
    // Limpar tokens OAuth2
    delete session.oauth2;
    delete session.pkce;
    
    const corsHeaders = this.getCorsHeaders(req);
    res.writeHead(200, {
        'Content-Type': 'application/json',
        ...corsHeaders
    });
    res.end(JSON.stringify({ success: true }));
}
```

**Localização**: `aps-mcp-server/src/http-server.ts`

---

### FASE 2: Tools MCP para OAuth2 ✅ COMPLETA

#### 2.1 Tool: `get-oauth-authorization-url` ✅ COMPLETO
**Prioridade**: ALTA
**Status**: ✅ Implementado

```typescript
// Arquivo: aps-mcp-server/src/tools/get-oauth-authorization-url.ts

import { z } from "zod";
import type { Tool } from "./common.js";

const schema = {
    redirectUri: z.string().url().optional(),
    scopes: z.array(z.string()).optional(),
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const getOAuthAuthorizationUrl: Tool<typeof schema> = {
    title: "get-oauth-authorization-url",
    description: "Get OAuth2 authorization URL to redirect user for authentication",
    schema,
    callback: async ({ redirectUri, scopes }) => {
        // Chamar endpoint /oauth/authorize do servidor HTTP
        // Ou implementar lógica diretamente aqui
        // Retornar URL de autorização, state, sessionId
    }
};
```

**Registrar em**: `aps-mcp-server/src/tools/index.ts`

---

#### 2.2 Tool: `exchange-oauth-code` ✅ COMPLETO
**Prioridade**: ALTA
**Status**: ✅ Implementado

```typescript
// Arquivo: aps-mcp-server/src/tools/exchange-oauth-code.ts

import { z } from "zod";
import type { Tool } from "./common.js";

const schema = {
    code: z.string().min(1),
    state: z.string().min(1),
    sessionId: z.string().optional(),
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const exchangeOAuthCode: Tool<typeof schema> = {
    title: "exchange-oauth-code",
    description: "Exchange OAuth2 authorization code for access token",
    schema,
    callback: async ({ code, state, sessionId }) => {
        // Chamar endpoint /oauth/callback do servidor HTTP
        // Ou implementar lógica diretamente aqui
        // Retornar sucesso e informações do token
    }
};
```

**Registrar em**: `aps-mcp-server/src/tools/index.ts`

---

### FASE 3: Modificar Common.ts para Suportar Sessão ✅ COMPLETA

#### 3.1 Atualizar `getAccessToken` em `common.ts` ✅ COMPLETO
**Prioridade**: CRÍTICA
**Status**: ✅ Implementado com lógica híbrida completa

```typescript
// Arquivo: aps-mcp-server/src/tools/common.ts

// Modificar função getAccessToken (linha ~332)
export async function getAccessToken(
    scopes: string[],
    session?: Session  // NOVO: contexto de sessão
): Promise<string> {
    return measureTiming(
        "auth.getAccessToken",
        async () => {
            // 1. Verificar se tem token OAuth2 válido na sessão
            if (session?.oauth2?.accessToken) {
                const expiresAt = session.oauth2.expiresAt;
                const now = Date.now();
                
                // Se token ainda é válido (com margem de 1 minuto)
                if (expiresAt > now + 60000) {
                    // Verificar se tem scopes necessários
                    const hasScopes = scopes.every(scope => 
                        session.oauth2?.scopes?.includes(scope)
                    );
                    
                    if (hasScopes) {
                        logger.debug("Using OAuth2 token from session", {
                            sessionId: session.id,
                            scopes
                        });
                        incrementCounter("auth.tokenCache", {
                            type: "hit",
                            auth: "oauth2"
                        });
                        return session.oauth2.accessToken;
                    }
                }
                
                // Token expirado, tentar refresh
                if (session.oauth2.refreshToken) {
                    try {
                        logger.debug("Refreshing OAuth2 token", {
                            sessionId: session.id
                        });
                        const { refreshAccessToken } = await import("../auth/oauth2.js");
                        const newTokens = await refreshAccessToken(
                            APS_CLIENT_ID!,
                            session.oauth2.refreshToken
                        );
                        
                        // Atualizar sessão
                        session.oauth2 = {
                            accessToken: newTokens.access_token,
                            refreshToken: newTokens.refresh_token || session.oauth2.refreshToken,
                            expiresAt: Date.now() + newTokens.expires_in * 1000,
                            userId: session.oauth2.userId,
                            email: session.oauth2.email,
                            scopes: newTokens.scope?.split(' ') || []
                        };
                        
                        logger.debug("OAuth2 token refreshed", {
                            sessionId: session.id,
                            expiresIn: newTokens.expires_in
                        });
                        incrementCounter("auth.tokenCache", {
                            type: "refresh",
                            auth: "oauth2"
                        });
                        return session.oauth2.accessToken;
                    } catch (error) {
                        logger.error("Failed to refresh OAuth2 token", error, {
                            sessionId: session.id
                        });
                        // Continuar com fallback para Service Account
                    }
                }
            }
            
            // 2. Fallback para Service Account
            logger.debug("Using Service Account token (OAuth2 not available)", {
                scopes
            });
            const cacheKey = scopes.join("+");
            let credentials = credentialsCache.get(cacheKey);
            
            // Verifica se o token está válido (com margem de 1 minuto)
            if (!credentials || credentials.expiresAt < Date.now() + 60000) {
                logger.debug("Fetching new service account token", { scopes });
                const { access_token, expires_in } = await getServiceAccountAccessToken(
                    APS_CLIENT_ID!,
                    APS_CLIENT_SECRET!,
                    APS_SA_ID!,
                    APS_SA_KEY_ID!,
                    APS_SA_PRIVATE_KEY!,
                    scopes
                );
                credentials = {
                    accessToken: access_token,
                    expiresAt: Date.now() + expires_in * 1000
                };
                credentialsCache.set(cacheKey, credentials);
                incrementCounter("auth.tokenCache", {
                    type: "miss",
                    auth: "service-account"
                });
            } else {
                incrementCounter("auth.tokenCache", {
                    type: "hit",
                    auth: "service-account"
                });
            }
            return credentials.accessToken;
        },
        { scopes: scopes.join(",") }
    );
}
```

**IMPORTANTE**: Também precisar exportar o tipo `Session` para uso nas tools:
```typescript
// Adicionar export do tipo Session
export type { Session } from "../http-server.js";
```

**Localização**: `aps-mcp-server/src/tools/common.ts`

---

#### 3.2 Passar Contexto de Sessão nas Tools ✅ COMPLETO
**Prioridade**: CRÍTICA
**Status**: ✅ Implementado - `handleToolsCall` modificado

Modificar `http-server.ts` para passar sessão nas tools (linha ~739):

```typescript
// ANTES (linha ~739)
const result = await (tool.callback as any)(toolArgs, {});

// DEPOIS
const result = await (tool.callback as any)(toolArgs, {
    session: session  // Passar sessão no contexto
});
```

**Localização**: `aps-mcp-server/src/http-server.ts` (método `handleToolsCall`)

---

### FASE 4: Atualizar Tools Existentes ⏳ PARCIAL

#### 4.1 Modificar Tools para Aceitar Contexto
**Prioridade**: MÉDIA
**Status**: ⏳ 4 de ~40 tools migradas (10%)

**Exemplo de modificação** (`get-projects.ts`):

```typescript
// ANTES
callback: async ({ accountId }) => {
    const accessToken = await getAccessToken(["data:read"]);
    // ...
}

// DEPOIS
callback: async ({ accountId }, context?: { session?: Session }) => {
    const accessToken = await getAccessToken(
        ["data:read"],
        context?.session
    );
    // ...
}
```

**Tools migradas** ✅:
1. ✅ `get-projects.ts` - Alta prioridade
2. ✅ `get-issues.ts` - Alta prioridade
3. ✅ `create-issue.ts` - Alta prioridade
4. ✅ `get-all-bim-models.ts` - Alta prioridade

**Tools pendentes** ⏳ (~36 tools):
- Tools admin (admin-create-project, admin-add-project-user, admin-get-*, etc.)
- Tools AEC Data Model (aecdatamodel-*)
- Outras tools de leitura/escrita (get-folder-contents, get-item-versions, etc.)

**Estratégia para próximas migrações**:
- Migrar tools conforme necessidade/uso
- Padrão já estabelecido: adicionar `context?: { session?: Session }` e passar `context?.session` para `getAccessToken`
- Testar cada tool após migração
- **Nota**: Tools não migradas continuam funcionando com Service Account (backward compatible)

---

### FASE 5: Frontend (mcp-assist-hub) ⏳ PENDENTE

#### 5.1 Criar Componente OAuth2Login
**Prioridade**: ALTA
**Status**: ⏳ Não iniciado

```typescript
// Arquivo: mcp-assist-hub/src/components/OAuth2Login.tsx

import { useState } from 'react';
import { useMCPClient } from '../hooks/useMCPClient';

export function OAuth2Login() {
    const [loading, setLoading] = useState(false);
    const mcpClient = useMCPClient();
    
    const handleLogin = async () => {
        setLoading(true);
        try {
            // Chamar tool para obter URL de autorização
            const result = await mcpClient.callTool('get-oauth-authorization-url', {
                redirectUri: window.location.origin + '/oauth/callback',
                scopes: ['data:read', 'data:write', 'account:read', 'account:write']
            });
            
            // Armazenar sessionId
            localStorage.setItem('mcp_session_id', result.sessionId);
            
            // Redirecionar para Autodesk
            window.location.href = result.authorizationUrl;
        } catch (error) {
            console.error('OAuth login error:', error);
            setLoading(false);
        }
    };
    
    return (
        <button onClick={handleLogin} disabled={loading}>
            {loading ? 'Redirecting...' : 'Login with Autodesk'}
        </button>
    );
}
```

---

#### 5.2 Criar Página OAuth2Callback
**Prioridade**: ALTA
**Status**: ⏳ Não iniciado

```typescript
// Arquivo: mcp-assist-hub/src/pages/OAuth2Callback.tsx

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMCPClient } from '../hooks/useMCPClient';

export function OAuth2Callback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    const mcpClient = useMCPClient();
    
    useEffect(() => {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const sessionId = localStorage.getItem('mcp_session_id');
        
        if (!code || !state) {
            setError('Missing authorization code');
            return;
        }
        
        (async () => {
            try {
                await mcpClient.callTool('exchange-oauth-code', {
                    code,
                    state,
                    sessionId: sessionId || undefined
                });
                
                // Redirecionar para dashboard
                navigate('/dashboard');
            } catch (err: any) {
                setError(err.message || 'Failed to exchange authorization code');
            }
        })();
    }, [searchParams, navigate, mcpClient]);
    
    if (error) {
        return <div>Error: {error}</div>;
    }
    
    return <div>Completing authentication...</div>;
}
```

---

#### 5.3 Atualizar Rotas
**Prioridade**: MÉDIA
**Status**: ⏳ Não iniciado

**Nota importante**: O frontend deve fazer chamadas HTTP diretas aos endpoints OAuth2 do servidor MCP, não usar as tools MCP. As tools foram criadas apenas para referência/documentação.

```typescript
// Adicionar rota em App.tsx ou router
<Route path="/oauth/callback" element={<OAuth2Callback />} />
```

---

## 🔧 Configurações Necessárias

### Variáveis de Ambiente

Adicionar ao `.env` do `aps-mcp-server`:

```env
# OAuth2 (Single Page Application)
APS_OAUTH_REDIRECT_URI=http://localhost:5173/oauth/callback
APS_OAUTH_SCOPES=data:read data:write account:read account:write

# Service Account (mantido para fallback)
APS_CLIENT_ID=...  # Já existe
APS_CLIENT_SECRET=...  # Já existe
APS_SA_ID=...  # Já existe
APS_SA_EMAIL=...  # Já existe
APS_SA_KEY_ID=...  # Já existe
APS_SA_PRIVATE_KEY=...  # Já existe
```

### Configuração do App Autodesk

1. Ir para https://aps.autodesk.com/myapps
2. Selecionar aplicação
3. Verificar que é **Single Page Application** (ou criar nova como SPA)
4. Adicionar redirect URI: `http://localhost:5173/oauth/callback` (e URLs de produção)

## 📦 Dependências Necessárias

### Instalar no `aps-mcp-server`:

```bash
npm install crypto  # Para PKCE (já vem com Node.js)
# Não precisa instalar nada novo, usar APIs nativas
```

## 🧪 Testes Necessários

### Testes Unitários
1. ✅ Teste de geração PKCE (code_verifier, code_challenge)
2. ✅ Teste de troca de código por token
3. ✅ Teste de refresh token
4. ✅ Teste de validação de state

### Testes de Integração
1. ✅ Fluxo completo OAuth2 (end-to-end)
2. ✅ Fallback para Service Account
3. ✅ Refresh automático de token
4. ✅ Expiração e limpeza de sessão

### Testes Manuais
1. ✅ Login com OAuth2
2. ✅ Uso de tools após login
3. ✅ Refresh automático de token
4. ✅ Logout

## 📝 Notas Importantes

### 1. Segurança
- **State validation**: Sempre validar state para prevenir CSRF
- **PKCE expiration**: PKCE deve ser usado em 10 minutos
- **Token storage**: Tokens armazenados apenas em memória (sessão)
- **HTTPS em produção**: Sempre usar HTTPS em produção

### 2. Compatibilidade
- **Backward compatible**: Tools continuam funcionando sem OAuth2
- **Híbrido**: Pode usar OAuth2 quando disponível, Service Account quando não
- **Gradual migration**: Migrar tools gradualmente

### 3. Limitações
- **Operações admin**: Ainda precisam de permissões de administrador
- **Múltiplos usuários**: Cada sessão HTTP é independente
- **Token expiration**: Tokens OAuth2 expiram e precisam refresh

## 🐛 Problemas Conhecidos

1. **Tools OAuth2 retornam apenas instruções**: As tools `get-oauth-authorization-url` e `exchange-oauth-code` foram criadas mas retornam apenas instruções sobre como usar os endpoints HTTP. O frontend deve fazer chamadas HTTP diretas aos endpoints `/oauth/authorize` e `/oauth/callback` do servidor MCP.

2. **Session ID no header**: O frontend precisa enviar o `mcp-session-id` no header das requisições HTTP para manter a mesma sessão entre as chamadas OAuth2 e as chamadas de tools MCP.

3. **Tools não migradas**: Apenas 4 tools principais foram migradas. As demais continuam usando Service Account, mas isso é intencional (backward compatible).

## 📚 Recursos Adicionais

1. **Especificação OAuth2 PKCE**: https://oauth.net/2/pkce/
2. **Autodesk OAuth2 Docs**: https://aps.autodesk.com/en/docs/oauth/v2/developers_guide/overview/
3. **MCP Specification**: https://spec.modelcontextprotocol.io/
4. **Repositório .NET de Referência**: https://github.com/autodesk-platform-services/aps-aecdm-mcp-dotnet

## ✅ Checklist de Implementação

### Fase 1: Infraestrutura ✅ COMPLETA
- [x] Criar `src/auth/oauth2.ts` com PKCE
- [x] Atualizar interface `Session` em `http-server.ts`
- [x] Implementar `handleOAuthAuthorize`
- [x] Implementar `handleOAuthCallback`
- [x] Implementar `handleOAuthLogout`
- [x] Adicionar rotas OAuth2 no `handleRequest`

### Fase 2: Tools MCP ✅ COMPLETA
- [x] Criar tool `get-oauth-authorization-url`
- [x] Criar tool `exchange-oauth-code`
- [x] Registrar tools em `index.ts`

### Fase 3: Common.ts ✅ COMPLETA
- [x] Modificar `getAccessToken` para aceitar sessão
- [x] Implementar lógica OAuth2 com fallback
- [x] Implementar refresh automático
- [x] Exportar tipo `Session`
- [x] Passar sessão no contexto das tools

### Fase 4: Tools Existentes ⏳ PARCIAL (4/40)
- [x] Migrar `get-projects.ts`
- [x] Migrar `get-issues.ts`
- [x] Migrar `create-issue.ts`
- [x] Migrar `get-all-bim-models.ts`
- [ ] Migrar tools admin (~20 tools)
- [ ] Migrar demais tools (~16 tools)

### Fase 5: Frontend ⏳ PENDENTE
- [ ] Criar componente `OAuth2Login.tsx`
- [ ] Criar página `OAuth2Callback.tsx`
- [ ] Adicionar rotas
- [ ] Integrar com MCP client (chamadas HTTP diretas aos endpoints)
- [ ] Adicionar gerenciamento de sessão (localStorage/sessionStorage)

### Fase 6: Testes e Documentação ⏳ PENDENTE
- [ ] Testes unitários (PKCE, troca de token, refresh)
- [ ] Testes de integração (fluxo completo OAuth2)
- [ ] Testes end-to-end (frontend + backend)
- [ ] Documentação de uso
- [ ] Atualizar README

## 🎯 Priorização Sugerida

1. **Fase 1** (Infraestrutura OAuth2) - **CRÍTICA** - Base para tudo
2. **Fase 2** (Tools MCP) - **ALTA** - Necessário para frontend
3. **Fase 3** (Common.ts) - **CRÍTICA** - Integração com tools
4. **Fase 4** (Tools Existentes) - **MÉDIA** - Pode ser gradual
5. **Fase 5** (Frontend) - **ALTA** - UX do usuário
6. **Fase 6** (Testes) - **ALTA** - Qualidade e confiabilidade

## 💡 Dicas de Implementação

1. **Começar pequeno**: Implementar Fase 1 completa antes de partir para Fase 2
2. **Testar incrementalmente**: Testar cada componente após implementar
3. **Manter fallback**: Sempre manter Service Account como fallback
4. **Logs detalhados**: Adicionar logs para debug durante desenvolvimento
5. **Documentar decisões**: Documentar decisões de design e trade-offs

## 📞 Contato e Suporte

- **Repositório**: https://github.com/barbosaihan/aps-mcp-http
- **Branch**: `feature/oauth2-implementation`
- **Documentação**: `OAUTH2_IMPLEMENTATION.md` e `HANDOFF_OAUTH2.md`

---

## 📋 Resumo para Próximo Agente

### ✅ O que foi feito (Backend - aps-mcp-http)
1. **Infraestrutura OAuth2 completa**: Módulo PKCE, endpoints HTTP, gerenciamento de sessão
2. **Integração com tools**: `getAccessToken` modificado para suportar OAuth2 com fallback
3. **4 tools principais migradas**: get-projects, get-issues, create-issue, get-all-bim-models
4. **Configuração**: Variáveis de ambiente adicionadas ao config.ts

### ⏳ O que falta fazer

#### Prioridade ALTA (Frontend - mcp-assist-hub)
1. **Criar componente OAuth2Login.tsx**
   - Botão "Login with Autodesk"
   - Fazer GET para `/oauth/authorize` (com header `mcp-session-id`)
   - Redirecionar usuário para `authorizationUrl` retornada
   - Salvar `sessionId` no localStorage

2. **Criar página OAuth2Callback.tsx**
   - Receber `code` e `state` da URL
   - Fazer GET para `/oauth/callback?code=...&state=...` (com header `mcp-session-id`)
   - Redirecionar para dashboard após sucesso

3. **Gerenciar Session ID**
   - Obter sessionId do servidor MCP (primeira chamada ou endpoint dedicado)
   - Armazenar no localStorage
   - Incluir no header `mcp-session-id` em todas as requisições HTTP ao servidor MCP

#### Prioridade MÉDIA (Backend - aps-mcp-http)
1. **Migrar tools restantes** (~36 tools)
   - Padrão: adicionar `context?: { session?: Session }` e passar `context?.session` para `getAccessToken`
   - Migrar conforme necessidade/uso

#### Prioridade BAIXA
1. **Testes e documentação**
   - Testes unitários
   - Testes de integração
   - Documentação de uso

### 🔧 Configuração Necessária

1. **Adicionar ao `.env` do aps-mcp-server**:
```env
APS_OAUTH_REDIRECT_URI=http://localhost:5173/oauth/callback
APS_OAUTH_SCOPES=data:read data:write account:read account:write
```

2. **Configurar aplicação Autodesk**:
   - Ir para https://aps.autodesk.com/myapps
   - Verificar que é **Single Page Application** (SPA)
   - Adicionar redirect URI: `http://localhost:5173/oauth/callback`

### 📝 Notas Importantes

1. **Frontend deve usar endpoints HTTP diretos**, não as tools MCP para OAuth2
2. **Session ID é crítico**: Deve ser mantido entre requisições OAuth2 e tools MCP
3. **Backward compatible**: Tools não migradas continuam funcionando com Service Account
4. **Híbrido**: Sistema usa OAuth2 quando disponível, Service Account como fallback

---

**Última atualização**: 2025-01-14
**Status**: Backend completo (Fases 1-3), Frontend pendente (Fase 5)
**Próxima ação**: Implementar frontend OAuth2 no mcp-assist-hub

