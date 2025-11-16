#!/bin/bash

# Script de deploy para VPS
# Uso: ./deploy-vps.sh [PORT]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 Deploy APS MCP HTTP Server para VPS${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

# Configurações padrão
PORT=${1:-8080}

echo -e "${YELLOW}📋 Configurações:${NC}"
echo "  Porta: $PORT"
echo ""

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não está instalado!${NC}"
    exit 1
fi

# Verificar se Docker Compose está instalado
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose não está instalado!${NC}"
    exit 1
fi

# Verificar se arquivo .env existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado!${NC}"
    echo -e "${YELLOW}📝 Criando arquivo .env de exemplo...${NC}"
    cat > .env.example << EOF
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
APS_SA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----\\n"

# OAuth2 (Opcional)
APS_OAUTH_REDIRECT_URI=
APS_OAUTH_SCOPES=

# CORS (Opcional)
ALLOWED_ORIGINS=

# Logging (Opcional)
LOG_LEVEL=INFO
EOF
    echo -e "${RED}❌ Por favor, crie o arquivo .env com suas credenciais APS!${NC}"
    echo -e "${YELLOW}   Use .env.example como referência${NC}"
    exit 1
fi

# Verificar variáveis obrigatórias no .env
echo -e "${YELLOW}🔍 Verificando variáveis de ambiente obrigatórias...${NC}"
source .env

REQUIRED_VARS=("APS_CLIENT_ID" "APS_CLIENT_SECRET" "APS_SA_ID" "APS_SA_EMAIL" "APS_SA_KEY_ID" "APS_SA_PRIVATE_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo -e "${RED}❌ Variáveis obrigatórias faltando no .env:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${RED}   - $var${NC}"
    done
    exit 1
fi

echo -e "${GREEN}✅ Todas as variáveis obrigatórias estão configuradas${NC}"
echo ""

# Verificar se a rede existe
echo -e "${YELLOW}🔍 Verificando rede Docker...${NC}"
if ! docker network ls | grep -q mcp_network; then
    echo -e "${YELLOW}⚠️  Rede 'mcp_network' não encontrada. Criando...${NC}"
    docker network create mcp_network || true
    echo -e "${GREEN}✅ Rede 'mcp_network' criada${NC}"
else
    echo -e "${GREEN}✅ Rede 'mcp_network' encontrada${NC}"
fi
echo ""

# Parar container existente se houver
if docker ps -a | grep -q jarvis_aps_http; then
    echo -e "${YELLOW}🛑 Parando container existente...${NC}"
    docker stop jarvis_aps_http 2>/dev/null || true
    docker rm jarvis_aps_http 2>/dev/null || true
    echo -e "${GREEN}✅ Container antigo removido${NC}"
    echo ""
fi

# Build e deploy
echo -e "${YELLOW}🔨 Construindo imagem Docker...${NC}"
export PORT=$PORT

docker-compose -f docker-compose.prod.yml build --no-cache

echo ""
echo -e "${YELLOW}🚀 Iniciando container...${NC}"
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📊 Status do container:${NC}"
docker ps | grep jarvis_aps_http || echo "Container não está rodando"
echo ""
echo -e "${YELLOW}📝 Logs do container:${NC}"
echo "  Para ver os logs: docker logs -f jarvis_aps_http"
echo ""
echo -e "${YELLOW}🌐 Endpoint MCP disponível em:${NC}"
echo "  http://SEU_IP_VPS:$PORT/mcp"
echo ""
echo -e "${YELLOW}🔍 Testar endpoint:${NC}"
echo "  curl http://localhost:$PORT/mcp"
echo ""

