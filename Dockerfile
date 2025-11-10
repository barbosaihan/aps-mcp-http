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

# Instalar dependências do Node.js (apenas produção)
WORKDIR /app/aps-mcp-server
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile --production=false; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

# Copiar código fonte
COPY ./aps-mcp-server .

# Compilar TypeScript
RUN npm run build

# Stage 2: Runtime stage - imagem final otimizada (apenas Node.js)
FROM node:20-slim

WORKDIR /app

# Copiar apenas os arquivos compilados e necessários do stage de build
COPY --from=builder /app/aps-mcp-server/build ./aps-mcp-server/build
COPY --from=builder /app/aps-mcp-server/package.json ./aps-mcp-server/
COPY --from=builder /app/aps-mcp-server/node_modules ./aps-mcp-server/node_modules

# Criar o arquivo .env com as credenciais e a chave PKCS#8 formatada
# Esta é a única abordagem que a aplicação 'aps-mcp-server' entende.
RUN echo "APS_CLIENT_ID=fJSqoo0fTrXvMVPCMp8ZkpQXNICdoxqHYAgATZEVpiduaiyo" > /app/aps-mcp-server/.env && \
    echo "APS_CLIENT_SECRET=HdKJ5S9X22rtMrdmsPYOnYQwY6WJiq2a2HsQCbHsmFAfiU1X8w9C6mHGEO0egfS9" >> /app/aps-mcp-server/.env && \
    echo "APS_SA_ID=2SN2J9GFLBSS6RN3" >> /app/aps-mcp-server/.env && \
    echo "APS_SA_EMAIL=ssa-ihanbb@fJSqoo0fTrXvMVPCMp8ZkpQXNICdoxqHYAgATZEVpiduaiyo.adskserviceaccount.com" >> /app/aps-mcp-server/.env && \
    echo "APS_SA_KEY_ID=4f7741c0-dcf5-443f-a074-eb272068aa4a" >> /app/aps-mcp-server/.env && \
    echo 'APS_SA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAnHW0W8/NbuSwogIZA2qWjhhYsdhGTkKSsfVT9HxyZW7Sswn4\nOVmTuJ15HHZldryQ4F8WLEKGzqJoxrKvkZSOElJ8gbTUU64Vgli6EjsA/y0nsU6z\nl1PTIkONBpE17OY+EAiqcW680h3VY2eIUBscuqCVI7lN5NZUclytYyp6RFRZ65Ph\nPv8uHkbodwEeH9aO448v56ZFeLJdhQJO3FwG5Ajfgqn54QwePFynBQBzHiZ2BRbj\nWg+u38vJgSMOsJSMY4L+1rxIie+QPJEhzqbMhIF+XjTEHSfLBZzUP5AL+O+F35xR\ntwFJvvwIcMj2NgbBDB0vPHIFvFKohcA/GG6N1QIDAQABAoIBAEMgCJofRD7gZJuN\nFNgvYZpi/aKHbFplG3S4ESXiQl4cNs9TZqiMMuFQxkYc0Zkoe2uXv/aLMDT03sjo\nnoRx3KYlt38aasHf/SBoGqR5pgrUf6QFZO12rC2WF6oKoL0bZuMQJLf3z5DB9evo\n3kWn7CJxhKrH9JBKF/7cnhLehYhMj6Np5LvqlCwWBt19bhAI32BBH/3xPyNqXNlf\n5W34sQOyVfR48KcpKc4nLWdaWEXolKEUmw3WJYgmn5VBZD7cUuKLobGPsSpwHyza\n/oUGRSTXbNJU0R7kCKVb/IMZ2664Q4rPucy6HjM2px9ES6+jjluU+lKxtUBPiO+O\nOxI6Gr0CgYEA3HYikZCWFG9y6vj9v/tTJN4KIpBGmu4O3F/3QLwpgs7v4egZp3i3\nHSrr4m82kDb7tqB69eGkhFXvAGvbe6b/f/+oMhbSeC+gqrM8uL+ExRob8+uxuDiy\nx5IAym7U2I4XT3RagzSrQD+Js9mhMa/s/1wE13xv7v6bJhwJcTEKGLMCgYEAta5j\nbNGEDxHb/BOHmdtbVL4R2MBU8KIriXyykTonb34uos2f3y0WtZhwDXuGBcEAPdD/\n7wOhHjCPn+c1n8zSFIyVvNUraE1CJPFLyOMYSQhxIAz6c7Lz66qPdzx3Ek6XxC4i\nTry3heJ/yxvIBZsKGv7nPcuSLEhr5pxO2VXZs1cCgYEAtQlJn9FkfMl8S9pFvbYr\nc5XmKrXhVO5yQ6OGjaE2UVWPhSosjurBK/GIHLyIyOptz21/K5SsnYNXrTfk12iu\nXTTasK8vDETIIgTnsyqKY7TqCWad3RKqNNn/TjyvClm8aKG6hg3lJvBGKutmxD+c\nVaIB09Y6sL5hN21Ej6/eg6MCgYAYe+fqQlIJtd5vmjIsCePFB9hf3YuU4kX7wVJP\nQAcQf3DJf+yLpwfocSKornzhSaE+s2vKSjLsXp78baxMXM3y9v8284NmCwNe9yW/\nbNtY/EpCh305GmTE3bd32i4xyWWqio0VD1msMVoHhTbvinVSLgf7y/NnBFuGOIpn\nv6oXAQKBgQDYjcrP3Z2iRuMXglH3mpxt5KTce8kIBX1NqAITb2djjtG/llc4obsw\nf/uWQOPHZcSxLzMRR+ZmgaOD1oEmovy7jlceIQeBECkmdv1hBpsJnNrsPb35CrV8\nw2XmQXvLh6fqM3/vl150B/bS6w9A3EYc+p4wCu3+svzRpJpbuW633w==\n-----END RSA PRIVATE KEY-----\n"' >> /app/aps-mcp-server/.env

# Expor a porta que o servidor HTTP vai usar
EXPOSE 8080

# Variáveis de ambiente
ENV PORT=8080
ENV HOST=0.0.0.0
ENV MCP_ENDPOINT=/mcp
ENV DOCKER_ENV=true
ENV NODE_ENV=production

# Comando final para iniciar o servidor HTTP nativo (Streamable HTTP)
CMD ["node", "/app/aps-mcp-server/build/http-server-main.js"]
