# Servidor HTTP Nativo MCP (Streamable HTTP)

Este servidor implementa o protocolo **MCP Streamable HTTP** conforme a especificação oficial:
https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http

## 🎯 Objetivo

Substituir o `mcp-proxy` (Python) por uma implementação nativa em Node.js, eliminando a dependência de Python e reduzindo a complexidade do Dockerfile.

## ✅ Implementação Conforme Especificação

### 1. Endpoint Único MCP
- **Endpoint**: `/mcp` (configurável via `MCP_ENDPOINT`)
- **Métodos suportados**: `GET`, `POST`, `DELETE`, `OPTIONS`
- Conforme especificação: "single HTTP endpoint path that supports both POST and GET methods"

### 2. Validação de Origin (Segurança)
- ✅ Valida `Origin` header para prevenir DNS rebinding attacks
- ✅ Configurável via `ALLOWED_ORIGINS` env variable
- ✅ Em produção, recomenda-se usar `127.0.0.1` ao invés de `0.0.0.0`

### 3. Session Management
- ✅ Suporte a `Mcp-Session-Id` header
- ✅ Sessões únicas por cliente (UUID criptograficamente seguro)
- ✅ Limpeza automática de sessões expiradas (1 hora sem atividade)
- ✅ DELETE para terminar sessão explicitamente

### 4. SSE Streaming
- ✅ Server-Sent Events (SSE) para streaming de mensagens
- ✅ Suporte a `Last-Event-ID` header para resumability
- ✅ Event IDs únicos por sessão
- ✅ Múltiplas conexões SSE simultâneas por sessão

### 5. JSON-RPC Protocol
- ✅ Suporte a single requests, notifications, responses
- ✅ Suporte a batch requests (array de mensagens)
- ✅ Validação de `Accept` header (`application/json` e `text/event-stream`)
- ✅ Protocol version: `2025-03-26`

### 6. Métodos MCP Implementados
- ✅ `initialize` - Inicialização da sessão
- ✅ `tools/list` - Listar todas as tools disponíveis
- ✅ `tools/call` - Chamar uma tool
- ✅ `ping` - Health check

## 📋 Variáveis de Ambiente

```bash
# Porta do servidor (padrão: 8080)
PORT=8080

# Host do servidor (padrão: 0.0.0.0, em produção use 127.0.0.1)
HOST=0.0.0.0

# Endpoint MCP (padrão: /mcp)
MCP_ENDPOINT=/mcp

# Origens permitidas (separadas por vírgula)
ALLOWED_ORIGINS=https://example.com,https://app.example.com

# Nível de log (DEBUG, INFO, WARN, ERROR)
LOG_LEVEL=INFO

# Credenciais APS (obrigatórias)
APS_CLIENT_ID=...
APS_CLIENT_SECRET=...
APS_SA_ID=...
APS_SA_EMAIL=...
APS_SA_KEY_ID=...
APS_SA_PRIVATE_KEY=...
```

## 🚀 Como Usar

### Iniciar o servidor

```bash
# Desenvolvimento
node build/http-server-main.js

# Produção (Docker)
docker build -t aps-mcp-http .
docker run -p 8080:8080 aps-mcp-http
```

### Exemplo de Requisição (Initialize)

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

### Exemplo de SSE Stream (GET)

```bash
curl -N http://localhost:8080/mcp \
  -H "Accept: text/event-stream" \
  -H "Mcp-Session-Id: <session-id>"
```

### Exemplo de Chamada de Tool

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get-accounts",
      "arguments": {}
    }
  }'
```

## 🔒 Segurança

### Validação de Origin
O servidor valida o header `Origin` para prevenir DNS rebinding attacks:
- Em desenvolvimento: permite `localhost`, `127.0.0.1`, `[::1]`
- Em produção: configure `ALLOWED_ORIGINS` com as origens permitidas

### Recomendações de Produção
1. **Bind apenas para localhost** em produção:
   ```bash
   HOST=127.0.0.1
   ```

2. **Configure origens permitidas**:
   ```bash
   ALLOWED_ORIGINS=https://your-domain.com
   ```

3. **Use reverse proxy** (nginx, traefik) para:
   - HTTPS/TLS
   - Rate limiting
   - Autenticação adicional

## 📊 Comparação com mcp-proxy

| Característica | mcp-proxy (Python) | HTTP Server Nativo |
|---------------|-------------------|-------------------|
| Dependências | Python 3.10 + pip | Apenas Node.js |
| Imagem Docker | ~500MB (Python base) | ~200MB (Node.js slim) |
| Complexidade | Proxy intermediário | Implementação direta |
| Performance | Overhead do proxy | Sem overhead |
| Manutenção | Dependência externa | Código próprio |
| Especificação | HTTP+SSE (2024-11-05) | Streamable HTTP (2025-03-26) |

## 🐛 Debugging

### Logs Estruturados
O servidor usa logging estruturado em JSON:

```bash
# Ver logs em formato JSON
LOG_LEVEL=DEBUG node build/http-server-main.js

# Exemplo de log
{"level":"INFO","message":"MCP HTTP Server started","timestamp":"2025-01-10T00:00:00.000Z","context":{"host":"0.0.0.0","port":8080,"endpoint":"/mcp"}}
```

### Health Check
```bash
curl http://localhost:8080/health
# {"status":"ok","version":"0.0.1"}
```

## 📚 Referências

- [MCP Specification - Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Server-Sent Events (SSE) Specification](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

## ✅ Checklist de Conformidade

- [x] Endpoint único MCP (`/mcp`)
- [x] Suporte a GET e POST
- [x] Validação de Origin header
- [x] Session management com `Mcp-Session-Id`
- [x] SSE streaming com event IDs
- [x] Resumability com `Last-Event-ID`
- [x] Suporte a batch requests
- [x] Protocol version `2025-03-26`
- [x] CORS headers
- [x] Accept header validation
- [x] DELETE para terminar sessão
- [x] Graceful shutdown
- [x] Logging estruturado
- [x] Health check endpoint

