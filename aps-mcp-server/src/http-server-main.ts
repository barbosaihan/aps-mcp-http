/**
 * Entry point para o servidor HTTP nativo
 * 
 * Implementa o protocolo MCP Streamable HTTP conforme a especificação:
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 * 
 * Substitui o uso do mcp-proxy por uma implementação nativa
 */

import MCPHttpServer from "./http-server.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SA_ID, APS_SA_EMAIL, APS_SA_KEY_ID, APS_SA_PRIVATE_KEY } from "./config.js";
import { logger } from "./utils/logger.js";

// Validar variáveis de ambiente
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET || !APS_SA_ID || !APS_SA_EMAIL || !APS_SA_KEY_ID || !APS_SA_PRIVATE_KEY) {
    logger.error("Missing required environment variables", new Error("APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SA_ID, APS_SA_EMAIL, APS_SA_KEY_ID, APS_SA_PRIVATE_KEY are required"));
    process.exit(1);
}

// Obter configuração das variáveis de ambiente
const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
const MCP_ENDPOINT = process.env.MCP_ENDPOINT || "/mcp";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
    : [];

// Criar e iniciar servidor
const server = new MCPHttpServer(PORT, HOST, MCP_ENDPOINT, ALLOWED_ORIGINS);

// Graceful shutdown
process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully");
    await server.stop();
    process.exit(0);
});

process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down gracefully");
    await server.stop();
    process.exit(0);
});

// Iniciar servidor
server.start().catch((error) => {
    logger.error("Failed to start server", error);
    process.exit(1);
});

