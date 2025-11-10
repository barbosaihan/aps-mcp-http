# Configuração do n8n para conectar ao MCP Server

## 🐳 Comunicação entre Containers Docker

Quando o servidor MCP e o n8n estão em containers Docker separados, siga estas instruções:

## 1. Verificar Nome do Serviço MCP

No EasyPanel ou docker-compose, identifique o nome exato do serviço/container do MCP:
- Exemplo: `aps-mcp-http`, `jarvis-aps-http`, `mcp-server`

## 2. Configurar URL no n8n

No n8n, configure a URL do MCP usando o **nome do serviço/container**:

### Campos no n8n:

- **HTTP Stream URL**: `http://nome-do-container-mcp:80/mcp`
  - Exemplo: `http://aps-mcp-http:80/mcp`
  - Exemplo: `http://jarvis-aps-http:80/mcp`
  - **IMPORTANTE**: Use o nome do container, NÃO `0.0.0.0` ou `localhost`

- **HTTP Connection Timeout**: `60000` (60 segundos)

- **Messages Post Endpoint**: (deixe vazio)
  - O POST usa o mesmo endpoint `/mcp`

- **Additional Headers**: (deixe vazio)
  - Headers são enviados automaticamente

## 3. Verificar Rede Docker

Ambos os containers devem estar na **mesma rede Docker**:

```bash
# Verificar rede do container MCP
docker inspect <container-mcp> | grep -A 20 Networks

# Verificar rede do container n8n
docker inspect <container-n8n> | grep -A 20 Networks
```

Se não estiverem na mesma rede, configure no EasyPanel ou docker-compose.

## 4. Testar Conectividade

Dentro do container n8n, teste a conexão:

```bash
# Entrar no container n8n
docker exec -it <container-n8n> sh

# Testar health check
curl http://nome-do-container-mcp:80/health

# Testar endpoint MCP
curl -X POST http://nome-do-container-mcp:80/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "test",
        "version": "1.0.0"
      }
    }
  }'
```

## 5. Verificar Logs

Se houver erro, verifique os logs do servidor MCP:

```bash
# Ver logs do container MCP
docker logs <container-mcp>

# Ver logs em tempo real
docker logs -f <container-mcp>
```

## 🔧 Troubleshooting

### Erro: "fetch failed"
- ✅ Verifique se está usando o **nome do container** (não `0.0.0.0`)
- ✅ Verifique se ambos estão na **mesma rede Docker**
- ✅ Verifique se o servidor MCP está rodando: `docker ps`
- ✅ Teste conectividade: `curl http://nome-container:80/health`

### Erro: "Connection refused"
- ✅ Verifique se a porta está correta (80 interno do container)
- ✅ Verifique se o servidor está escutando em `0.0.0.0:80`
- ✅ Verifique firewall/regras de rede

### Erro: "Origin not allowed"
- ✅ O servidor está configurado para permitir comunicação entre containers
- ✅ Verifique se `DOCKER_ENV=true` está configurado no container MCP
- ✅ Requisições sem Origin header são permitidas automaticamente

## 📝 Exemplo Completo

### Configuração no n8n:

```
HTTP Stream URL: http://aps-mcp-http:80/mcp
HTTP Connection Timeout: 60000
Messages Post Endpoint: (vazio)
Additional Headers: (vazio)
```

### Variáveis de Ambiente no Container MCP:

```bash
PORT=80
HOST=0.0.0.0
MCP_ENDPOINT=/mcp
DOCKER_ENV=true
```

## ✅ Checklist

- [ ] Nome do container MCP identificado
- [ ] URL configurada no n8n usando nome do container
- [ ] Ambos containers na mesma rede Docker
- [ ] Servidor MCP rodando e acessível
- [ ] Teste de conectividade bem-sucedido
- [ ] Logs do servidor MCP sem erros

