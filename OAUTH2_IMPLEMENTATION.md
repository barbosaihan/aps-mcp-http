# Implementação OAuth2 no APS MCP Server

## Referência
Baseado na implementação do repositório: https://github.com/autodesk-platform-services/aps-aecdm-mcp-dotnet

## Visão Geral

Esta implementação adiciona suporte a OAuth2 PKCE flow ao servidor MCP, permitindo que usuários autentiquem com suas próprias credenciais Autodesk em vez de usar apenas Service Account.

## Arquitetura

### Fluxo OAuth2 PKCE

1. **Cliente solicita URL de autorização**
   - Tool: `get-oauth-authorization-url`
   - Retorna URL do Autodesk para login

2. **Usuário autoriza no Autodesk**
   - Redirecionamento para `https://developer.api.autodesk.com/authentication/v2/authorize`
   - Autodesk retorna com `code` e `state`

3. **Troca código por token**
   - Tool: `exchange-oauth-code`
   - Troca `code` + `code_verifier` por `access_token` e `refresh_token`
   - Armazena tokens na sessão MCP

4. **Uso do token**
   - Tools usam token OAuth2 quando disponível na sessão
   - Fallback para Service Account se não houver token OAuth2

## Componentes a Implementar

### 1. Autenticação OAuth2 (`src/auth/oauth2.ts`)

```typescript
// Geração de PKCE
- generateCodeVerifier(): string
- generateCodeChallenge(verifier: string): string
- generateState(): string

// Troca de código
- exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
    redirectUri: string
): Promise<OAuth2TokenResponse>

// Refresh token
- refreshAccessToken(
    refreshToken: string
): Promise<OAuth2TokenResponse>
```

### 2. Gerenciamento de Sessão (`src/http-server.ts`)

```typescript
interface Session {
    id: string;
    createdAt: number;
    lastActivity: number;
    streams: Set<string>;
    // NOVO
    oauth2?: {
        accessToken: string;
        refreshToken?: string;
        expiresAt: number;
        userId?: string;
        email?: string;
    };
    pkce?: {
        codeVerifier: string;
        state: string;
    };
}
```

### 3. Endpoints HTTP (`src/http-server.ts`)

- `GET /oauth/authorize` - Inicia fluxo OAuth2
- `GET /oauth/callback` - Recebe callback do Autodesk
- `POST /oauth/logout` - Limpa sessão OAuth2

### 4. Tools MCP

#### `get-oauth-authorization-url`
```typescript
{
    redirectUri?: string;
    scopes?: string[];
}
```

Retorna:
```json
{
    "authorizationUrl": "https://developer.api.autodesk.com/authentication/v2/authorize?...",
    "state": "...",
    "sessionId": "..."
}
```

#### `exchange-oauth-code`
```typescript
{
    code: string;
    state: string;
    sessionId?: string;
}
```

Retorna:
```json
{
    "success": true,
    "userId": "...",
    "email": "...",
    "expiresAt": "..."
}
```

#### `refresh-oauth-token` (opcional)
```typescript
{
    sessionId?: string;
}
```

### 5. Modificações em `common.ts`

```typescript
// Modificar para aceitar contexto de sessão
export async function getAccessToken(
    scopes: string[],
    session?: Session
): Promise<string> {
    // Se tem token OAuth2 válido na sessão, usar
    if (session?.oauth2?.accessToken && session.oauth2.expiresAt > Date.now()) {
        return session.oauth2.accessToken;
    }
    
    // Se tem refresh token, tentar renovar
    if (session?.oauth2?.refreshToken) {
        try {
            const newTokens = await refreshAccessToken(session.oauth2.refreshToken);
            // Atualizar sessão
            session.oauth2 = {
                accessToken: newTokens.access_token,
                refreshToken: newTokens.refresh_token || session.oauth2.refreshToken,
                expiresAt: Date.now() + newTokens.expires_in * 1000,
                userId: session.oauth2.userId,
                email: session.oauth2.email
            };
            return session.oauth2.accessToken;
        } catch (error) {
            // Falha ao renovar, continuar com fallback
        }
    }
    
    // Fallback para Service Account
    return await getServiceAccountAccessToken(scopes);
}
```

### 6. Modificações nas Tools

Todas as tools precisam aceitar contexto de sessão:

```typescript
// ANTES
const accessToken = await getAccessToken(["data:read"]);

// DEPOIS
const accessToken = await getAccessToken(
    ["data:read"],
    context?.session
);
```

## Configuração

### Variáveis de Ambiente

```env
# OAuth2 (Single Page Application)
APS_OAUTH_REDIRECT_URI=http://localhost:5173/oauth/callback
APS_OAUTH_SCOPES=data:read data:write account:read account:write

# Service Account (mantido para fallback)
APS_CLIENT_ID=...
APS_CLIENT_SECRET=...
APS_SA_ID=...
APS_SA_EMAIL=...
APS_SA_KEY_ID=...
APS_SA_PRIVATE_KEY=...
```

## Fluxo de Uso

### 1. Iniciar autenticação
```javascript
// No cliente MCP
const { authorizationUrl, sessionId } = await mcp.callTool(
    'get-oauth-authorization-url',
    { redirectUri: 'http://localhost:5173/oauth/callback' }
);

// Redirecionar usuário para authorizationUrl
window.location.href = authorizationUrl;
```

### 2. Callback do Autodesk
```javascript
// Autodesk redireciona para:
// http://localhost:5173/oauth/callback?code=...&state=...

// Trocar código por token
const result = await mcp.callTool('exchange-oauth-code', {
    code: urlParams.get('code'),
    state: urlParams.get('state'),
    sessionId: sessionId
});
```

### 3. Usar tools normalmente
```javascript
// Agora as tools usam automaticamente o token OAuth2
const projects = await mcp.callTool('get-projects', {
    accountId: '...'
});
```

## Benefícios

1. **Multi-usuário**: Cada usuário autentica com suas próprias credenciais
2. **Permissões individuais**: Usuários acessam apenas recursos que têm permissão
3. **Sem configuração de Service Account**: Não precisa adicionar Service Account em cada projeto
4. **Segurança**: Tokens são armazenados por sessão, não compartilhados
5. **Fallback**: Continua funcionando com Service Account se necessário

## Compatibilidade

- **Backward compatible**: Tools continuam funcionando com Service Account
- **Híbrido**: Pode usar OAuth2 quando disponível, Service Account quando não
- **Gradual**: Pode migrar tools gradualmente

## Próximos Passos

1. ✅ Criar branches `feature/oauth2-implementation`
2. ⏳ Implementar autenticação OAuth2 (PKCE)
3. ⏳ Adicionar gerenciamento de sessão
4. ⏳ Criar endpoints OAuth2 no HTTP server
5. ⏳ Criar tools MCP para OAuth2
6. ⏳ Modificar `common.ts` para suportar sessão
7. ⏳ Atualizar todas as tools
8. ⏳ Adicionar interface de login no mcp-assist-hub
9. ⏳ Testes e documentação

