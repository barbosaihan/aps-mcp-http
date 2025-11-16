# Deploy na VPS - APS MCP HTTP Server

Este guia explica como fazer o deploy do APS MCP HTTP Server na sua VPS usando Docker.

## Pré-requisitos

- VPS com Docker e Docker Compose instalados
- Credenciais do Autodesk Platform Services (APS)
- Acesso SSH à VPS

## Variáveis de Ambiente Obrigatórias

O servidor precisa das seguintes variáveis de ambiente:

```bash
APS_CLIENT_ID=seu_client_id
APS_CLIENT_SECRET=seu_client_secret
APS_SA_ID=seu_service_account_id
APS_SA_EMAIL=seu_service_account_email
APS_SA_KEY_ID=seu_key_id
APS_SA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

## Opção 1: Deploy com Docker Compose (Recomendado)

### 1. Copiar arquivos para a VPS

```bash
# Na sua máquina local
scp -r aps-mcp-http/ usuario@seu-ip-vps:/caminho/desejado/
```

### 2. Conectar na VPS

```bash
ssh usuario@seu-ip-vps
cd /caminho/desejado/aps-mcp-http
```

### 3. Criar arquivo .env

Crie um arquivo `.env` na raiz do projeto com as credenciais:

```bash
cat > .env << EOF
# Servidor
PORT=8080
HOST=0.0.0.0
MCP_ENDPOINT=/mcp
NODE_ENV=production

# APS Credentials (OBRIGATÓRIAS)
APS_CLIENT_ID=seu_client_id
APS_CLIENT_SECRET=seu_client_secret
APS_SA_ID=seu_service_account_id
APS_SA_EMAIL=seu_service_account_email
APS_SA_KEY_ID=seu_key_id
APS_SA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"

# OAuth2 (Opcional)
APS_OAUTH_REDIRECT_URI=https://seu-dominio.com/oauth/callback
APS_OAUTH_SCOPES=data:read data:write

# CORS (Opcional)
ALLOWED_ORIGINS=https://seu-frontend.com,https://outro-dominio.com

# Logging (Opcional)
LOG_LEVEL=INFO
EOF
```

**⚠️ IMPORTANTE:** 
- Mantenha o arquivo `.env` seguro e não o commite no Git
- O `APS_SA_PRIVATE_KEY` deve estar entre aspas e com `\n` para quebras de linha

### 4. Verificar/criar rede Docker

```bash
# Verificar se a rede existe
docker network ls | grep mcp_network

# Se não existir, criar
docker network create mcp_network
```

### 5. Build e iniciar

```bash
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

### 6. Verificar logs

```bash
docker logs -f jarvis_aps_http
```

## Opção 2: Deploy no Easypanel

### 1. Conectar Repositório

- Conecte o repositório GitHub no Easypanel
- Branch: `feature/oauth2-implementation`
- Build Path: `/`

### 2. Configurar Build

- **Método:** Dockerfile
- **Dockerfile:** `Dockerfile`

**⚠️ IMPORTANTE:** 
- As credenciais APS estão hardcoded no Dockerfile porque o Easypanel requer isso para o build funcionar corretamente.
- Esta é uma limitação do Easypanel - não é possível passar variáveis de ambiente durante o build do Dockerfile.
- As credenciais são necessárias no build time porque o código precisa delas em runtime.

### 3. Configurar Variáveis de Ambiente (Opcional)

No Easypanel, você pode adicionar variáveis de ambiente opcionais:

**Opcionais:**
- `PORT` (padrão: 8080)
- `HOST` (padrão: 0.0.0.0)
- `MCP_ENDPOINT` (padrão: /mcp)
- `APS_OAUTH_REDIRECT_URI`
- `APS_OAUTH_SCOPES`
- `ALLOWED_ORIGINS` (separado por vírgula)
- `LOG_LEVEL` (padrão: INFO)

**Nota:** As credenciais APS principais (`APS_CLIENT_ID`, `APS_CLIENT_SECRET`, etc.) já estão no Dockerfile e não precisam ser configuradas como variáveis de ambiente.

### 4. Configurar Porta

- Porta interna: `8080`
- Porta externa: configure conforme necessário

### 5. Deploy

O Easypanel fará o build e deploy automaticamente.

## Verificação

### Verificar status do container

```bash
docker ps | grep jarvis_aps_http
```

### Testar endpoint MCP

```bash
curl http://localhost:8080/mcp
```

### Verificar healthcheck

```bash
docker inspect jarvis_aps_http | grep -A 10 Health
```

## Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker logs jarvis_aps_http

# Verificar se as variáveis de ambiente estão corretas
docker exec jarvis_aps_http env | grep APS_
```

### Erro de credenciais

1. Verifique se todas as variáveis de ambiente obrigatórias estão configuradas
2. Verifique se o `APS_SA_PRIVATE_KEY` está formatado corretamente (com `\n` para quebras de linha)
3. Verifique se as credenciais são válidas no Autodesk Developer Portal

### Erro de porta em uso

```bash
# Verificar qual processo está usando a porta
netstat -tuln | grep 8080
# ou
lsof -i :8080

# Alterar a porta no docker-compose.prod.yml ou .env
```

### Rebuild completo

```bash
# Parar e remover container
docker-compose -f docker-compose.prod.yml down

# Remover imagem antiga
docker rmi aps-mcp-http_aps-mcp-http

# Rebuild
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

## Atualização

Para atualizar a aplicação:

```bash
# Parar container
docker-compose -f docker-compose.prod.yml down

# Atualizar código (git pull, etc)
git pull

# Rebuild e iniciar
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

## Segurança

⚠️ **IMPORTANTE:**
- As credenciais APS estão hardcoded no Dockerfile devido a limitações do Easypanel
- Esta é uma limitação conhecida do Easypanel - não é possível passar variáveis de ambiente durante o build do Dockerfile
- Para ambientes mais seguros (VPS própria), use o `docker-compose.prod.yml` com variáveis de ambiente
- Mantenha o repositório privado e com acesso restrito
- Use HTTPS em produção
- Configure CORS adequadamente com `ALLOWED_ORIGINS`
- Se usar docker-compose, nunca commite o arquivo `.env` no Git

## Estrutura de Arquivos

```
aps-mcp-http/
├── Dockerfile                 # Dockerfile otimizado para produção
├── docker-compose.prod.yml    # Compose file para produção
├── .dockerignore              # Arquivos ignorados no build
├── DEPLOY-VPS.md              # Esta documentação
├── .env                       # Variáveis de ambiente (não commitar!)
└── aps-mcp-server/
    └── ...
```

## Variáveis de Ambiente

### Obrigatórias
- `APS_CLIENT_ID`: Client ID do APS App
- `APS_CLIENT_SECRET`: Client Secret do APS App
- `APS_SA_ID`: Service Account ID
- `APS_SA_EMAIL`: Email do Service Account
- `APS_SA_KEY_ID`: Key ID da chave privada
- `APS_SA_PRIVATE_KEY`: Chave privada RSA (formato PKCS#8)

### Opcionais
- `PORT`: Porta do servidor (padrão: 8080)
- `HOST`: Host do servidor (padrão: 0.0.0.0)
- `MCP_ENDPOINT`: Endpoint MCP (padrão: /mcp)
- `APS_OAUTH_REDIRECT_URI`: URI de callback OAuth2
- `APS_OAUTH_SCOPES`: Escopos OAuth2 (separado por espaço)
- `ALLOWED_ORIGINS`: Origens permitidas para CORS (separado por vírgula)
- `LOG_LEVEL`: Nível de log (DEBUG, INFO, WARN, ERROR)

