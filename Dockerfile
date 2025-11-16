# Stage 1: Build stage - compila o código TypeScript
FROM node:20-slim AS builder

# Instalar dependências de build
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos de dependências
COPY ./aps-mcp-server/package.json ./aps-mcp-server/package-lock.json* ./aps-mcp-server/yarn.lock* ./aps-mcp-server/

# Instalar dependências do Node.js
WORKDIR /app/aps-mcp-server
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile --production=false; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

# Copiar código fonte
COPY ./aps-mcp-server .

# Compilar TypeScript
RUN npm run build

# Stage 2: Runtime stage - imagem final otimizada
FROM node:20-slim

WORKDIR /app

# Copiar apenas os arquivos compilados e necessários do stage de build
COPY --from=builder /app/aps-mcp-server/build ./aps-mcp-server/build
COPY --from=builder /app/aps-mcp-server/package.json ./aps-mcp-server/
COPY --from=builder /app/aps-mcp-server/node_modules ./aps-mcp-server/node_modules

# Criar o arquivo .env com as credenciais e a chave PKCS#8 formatada
# NOTA: As credenciais são hardcoded aqui porque o Easypanel requer isso para o build.
# Esta é a única abordagem que funciona com o Easypanel atualmente.
# Em ambientes mais seguros, use variáveis de ambiente via docker-compose.
WORKDIR /app/aps-mcp-server
RUN echo "APS_CLIENT_ID=AvvxuMeEApz3zYlZOP7EvqXLt63nz6p75d1UTF6NEekCEHrC" > /app/aps-mcp-server/.env && \
    echo "APS_CLIENT_SECRET=Bmv8IXUhoxHUQjOARTxrZF8xUrT44A90w058rXBUKWcalTYA07cwvAxjeo9pB8TG" >> /app/aps-mcp-server/.env && \
    echo "APS_SA_ID=79N2RECLRYWB3WJ2" >> /app/aps-mcp-server/.env && \
    echo "APS_SA_EMAIL=ssa-ihan-barbosa@AvvxuMeEApz3zYlZOP7EvqXLt63nz6p75d1UTF6NEekCEHrC.adskserviceaccount.com" >> /app/aps-mcp-server/.env && \
    echo "APS_SA_KEY_ID=a5b45794-d15f-42b2-ad3d-2d6790a70316" >> /app/aps-mcp-server/.env && \
    echo 'APS_SA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA3f2RdS6OFU6ckTm/U5B1BjG2/jWOpzG7H1d/Ni6ccjNTGNB8\n6iKaZgdczZXBsfuJET0RdzmWLeHcbA2eblgoa2UYmKc0PvK2ld9ZJkA9/yAEJnz9\nUe8MJ7uf5rpOlEeJFbWoA5S3IhvhU6qbgHdJOM81PDWSuDeMNwr8vRdPAlxXXpSS\noC0Brr5Zr7cKxh+YhSojuYvYOitmUM6z7BFW7DKyH2nu3xThcekN0UVvqvXmi9YU\nZ+rpCSTkT6xGWICoSQcrkjK4bOWiSdmTAvG5HZgd0n4tKJ+AVbLOEy3rv+fd0qem\nzSVOoinsMkGbfFsSo6ZMRsawOd8IFljKg3jaqwIDAQABAoIBABM53tszSQL3Z//7\n7GIkZL5AmAS0RsKcQASa412h89LANzYy+F6e2Jh1ksgLbFcp3dksXNLinesjYJ/L\nHimYYQfMHbE66f95re6VBXeWoMfz0egzcw0hkv/t9A9bm2qkN2816HNG8gV2PLGu\nWQFrU2AkMgwg57Akv3QU84a8+g7OH0OraLWLr0OJuTVkbXXijw3jgcpM8DvCLke0\nZdDiwUxWlsLVJ2Vwr5VqwPyq7YtaWY7O09EDAZXNcOgRFgQMoM0A/o7ULMbGuBtp\ncUp7TXtx+D0KZPxO1PpwwOxd2ifplQZ1QrSr76feY4MdDoTPkN61u6wh7N3rk13x\nVIbg/+ECgYEA9UKMJE/4OLV0p9SMw5U1PIH0ifuT+JHV6HAY30T+K9mU9fSAtiS8\nIU5/L1XkMl6xXCisjcj3PAzbDtC4aEE1bvcmLOqJeqVEwNix+ZI4xw3bkepIiqJ9\njSN5MNfVXQzjat/nF2lGmQJSWDdMrvpJUTZc6YnzN7g1+XdGCPjEAv0CgYEA57Yp\nbbqhLJgu9ej7mp2zeQnE3A0LbIZ9FvWyg8WJx1j7DAZKuOGsDZ6G/KLkqFubdN3S\noYJR6ZD9N+5a96hnVE67IPDIpnbT/JZt7VV0NiHNVrsrQprjSka2qogTKqxapGDg\n+y/5Nvx64Dm2m/Yol3gsl9/A1/MeFZa+Np4fKMcCgYAtfdZ4tcyY2C93IdmqPXbO\nblxpa5yaspI2tvQmFan/gDA9HsjxAAdVNjYpFYlqPl4vdevrsKcLIGdRbC2ISPAc\nUQNnuWkesqD6FDeOzyxw34Umn4otDM606yuDf8U3qThVjopSsVhC8UdMzZUPr6UB\nx0+ckdXnM+fvCcyXxWy2EQKBgBh5KwMF9UQKhts+UmTQR0Z/e6VqU0yRH+Eu7j3w\nvU6q3Uk12OqSG2QM3GEOq2wE0PSVAUxBwXkT8UrZCA6kYNWMw0MFa4v5fQZutQme\nPvoAs/l3J2iPh3Yu5dg5Kx0UuzYlbV3agU4HeMr6DYmHhF4LOVqJLYshiInrNAf8\nx3m9AoGBAJC00BAvvWt0Wkz8LzEVxww15tW3fjXMpUBPj0X/jy/2+Lodwbhz7qzJ\n5Dl44Fp1geSJ7fWUkX1kfRRYPpjAcz4oyV5YYcPnfFFXniCx4mKOAmYY4D2myaUz\n0mo2xbWLl+qaGRTKYXTDuOmCNsHoV6SmOWk/91lPn4o9aNqexwaQ\n-----END RSA PRIVATE KEY-----\n"' >> /app/aps-mcp-server/.env

# Expor a porta que o servidor HTTP vai usar
EXPOSE 8080

# Variáveis de ambiente
ENV PORT=8080
ENV HOST=0.0.0.0
ENV MCP_ENDPOINT=/mcp
ENV DOCKER_ENV=true
ENV NODE_ENV=production

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/mcp', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Comando final para iniciar o servidor HTTP nativo (Streamable HTTP)
CMD ["node", "/app/aps-mcp-server/build/http-server-main.js"]
