/**
 * Servidor HTTP nativo para MCP (Model Context Protocol)
 * 
 * Implementa o protocolo MCP Streamable HTTP conforme a especificação:
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 * 
 * Substitui o mcp-proxy por uma implementação nativa em Node.js
 */

import http from "node:http";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import * as tools from "./tools/index.js";
import { logger } from "./utils/logger.js";

// Tipos JSON-RPC
interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number | null;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: "2.0";
    id?: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

interface JsonRpcNotification {
    jsonrpc: "2.0";
    method: string;
    params?: any;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
type JsonRpcBatch = JsonRpcMessage[];

// Session management
interface Session {
    id: string;
    createdAt: number;
    lastActivity: number;
    streams: Set<string>;
}

class MCPHttpServer {
    private server: http.Server;
    private port: number;
    private host: string;
    private sessions: Map<string, Session> = new Map();
    private streams: Map<string, http.ServerResponse> = new Map();
    private eventIdCounter: Map<string, number> = new Map();
    private allowedOrigins: Set<string>;
    private mcpEndpoint: string;

    constructor(
        port: number = 8080,
        host: string = "0.0.0.0",
        mcpEndpoint: string = "/mcp",
        allowedOrigins: string[] = []
    ) {
        this.port = port;
        this.host = host;
        this.mcpEndpoint = mcpEndpoint;
        this.allowedOrigins = new Set(allowedOrigins);
        this.server = http.createServer(this.handleRequest.bind(this));

        // Cleanup expired sessions every 5 minutes
        setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    /**
     * Valida o header Origin para prevenir DNS rebinding attacks
     * 
     * Em ambientes containerizados (Docker), permite comunicação server-to-server
     * entre containers, que geralmente não enviam Origin header.
     */
    private validateOrigin(req: http.IncomingMessage): boolean {
        const origin = req.headers.origin;
        
        // Permitir requisições sem Origin header (comum em server-to-server, containers Docker)
        // Isso é necessário para comunicação entre containers (n8n -> MCP server)
        if (!origin) {
            logger.debug("Request without Origin header - allowing (server-to-server)", {
                url: req.url,
                method: req.method,
            });
            return true;
        }

        // Se há origens permitidas configuradas explicitamente, validar estritamente
        if (this.allowedOrigins.size > 0) {
            const isValid = this.allowedOrigins.has(origin);
            if (!isValid) {
                logger.warn("Request rejected - Origin not in allowed list", {
                    origin,
                    allowedOrigins: Array.from(this.allowedOrigins),
                    url: req.url,
                });
            }
            return isValid;
        }

        // Se não há origens configuradas, verificar o ambiente
        // Verificar se estamos em ambiente Docker/containerizado
        const isContainerized = process.env.DOCKER_ENV === "true" || 
                                process.env.KUBERNETES_SERVICE_HOST !== undefined;

        if (isContainerized) {
            // Em ambiente containerizado (Docker/Kubernetes), permitir qualquer origem
            // Isso é necessário para comunicação entre containers (n8n -> MCP server)
            // que podem não enviar Origin header ou enviar Origins diferentes
            logger.debug("Request from containerized environment - allowing", {
                origin,
                url: req.url,
                dockerEnv: process.env.DOCKER_ENV,
            });
            return true;
        }

        // Em ambiente não-containerizado, validar apenas localhost para segurança
        // Isso previne DNS rebinding attacks em ambientes locais
        try {
            const originUrl = new URL(origin);
            const isValid = originUrl.hostname === "localhost" || 
                           originUrl.hostname === "127.0.0.1" ||
                           originUrl.hostname === "[::1]";
            
            if (!isValid) {
                logger.warn("Request rejected - Origin not localhost", {
                    origin,
                    hostname: originUrl.hostname,
                    url: req.url,
                    hint: "Configure ALLOWED_ORIGINS or set DOCKER_ENV=true for containerized environments",
                });
            }
            
            return isValid;
        } catch (error) {
            logger.warn("Request rejected - Invalid Origin URL format", {
                origin,
                url: req.url,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /**
     * Cria ou recupera uma sessão
     */
    private getOrCreateSession(sessionId?: string): Session {
        if (sessionId) {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.lastActivity = Date.now();
                return session;
            }
        }

        // Criar nova sessão
        const newSession: Session = {
            id: randomUUID(),
            createdAt: Date.now(),
            lastActivity: Date.now(),
            streams: new Set(),
        };
        this.sessions.set(newSession.id, newSession);
        return newSession;
    }

    /**
     * Limpa sessões expiradas (mais de 1 hora sem atividade)
     */
    private cleanupSessions() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastActivity > oneHour) {
                // Fechar streams da sessão
                for (const streamId of session.streams) {
                    const stream = this.streams.get(streamId);
                    if (stream) {
                        try {
                            stream.end();
                        } catch (error) {
                            // Ignore
                        }
                        this.streams.delete(streamId);
                    }
                }
                this.sessions.delete(sessionId);
                this.eventIdCounter.delete(sessionId);
                logger.debug("Session expired and cleaned up", { sessionId });
            }
        }
    }

    /**
     * Handler principal para requisições HTTP
     */
    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);

        // Validar Origin (segurança)
        if (!this.validateOrigin(req)) {
            logger.warn("Request rejected due to invalid Origin", {
                origin: req.headers.origin,
                url: req.url,
            });
            const corsHeaders = this.getCorsHeaders(req);
            res.writeHead(403, { 
                "Content-Type": "application/json",
                ...corsHeaders
            });
            res.end(JSON.stringify({ error: "Forbidden: Invalid Origin" }));
            return;
        }

        // Handle OPTIONS (preflight) - precisa ser antes de outros handlers
        if (req.method === "OPTIONS") {
            const corsHeaders = this.getCorsHeaders(req);
            res.writeHead(200, corsHeaders);
            res.end();
            return;
        }

        // Health check endpoint (não é parte da spec, mas útil)
        if (url.pathname === "/health" && req.method === "GET") {
            const corsHeaders = this.getCorsHeaders(req);
            res.writeHead(200, { 
                "Content-Type": "application/json",
                ...corsHeaders
            });
            res.end(JSON.stringify({ status: "ok", version: "0.0.1" }));
            return;
        }

        // MCP endpoint único (conforme especificação)
        if (url.pathname === this.mcpEndpoint) {
            const sessionId = req.headers["mcp-session-id"] as string | undefined;
            const session = this.getOrCreateSession(sessionId);

            if (req.method === "GET") {
                await this.handleGetRequest(req, res, session);
            } else if (req.method === "POST") {
                await this.handlePostRequest(req, res, session);
            } else if (req.method === "DELETE") {
                await this.handleDeleteRequest(req, res, session);
            } else {
                const corsHeaders = this.getCorsHeaders(req);
                res.writeHead(405, { 
                    "Content-Type": "application/json",
                    ...corsHeaders
                });
                res.end(JSON.stringify({ error: "Method Not Allowed" }));
            }
            return;
        }

        // 404 para outros paths
        const corsHeaders = this.getCorsHeaders(req);
        res.writeHead(404, { 
            "Content-Type": "application/json",
            ...corsHeaders
        });
        res.end(JSON.stringify({ error: "Not found" }));
    }

    /**
     * Retorna headers CORS apropriados
     */
    private getCorsHeaders(req: http.IncomingMessage): Record<string, string> {
        const origin = req.headers.origin;
        const headers: Record<string, string> = {
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID",
            "Access-Control-Max-Age": "86400",
        };

        if (origin) {
            headers["Access-Control-Allow-Origin"] = origin;
            headers["Access-Control-Allow-Credentials"] = "true";
        } else {
            headers["Access-Control-Allow-Origin"] = "*";
        }

        return headers;
    }

    /**
     * Handle GET request (SSE stream)
     * Conforme spec: "Listening for Messages from the Server"
     */
    private async handleGetRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        session: Session
    ) {
        // Verificar Accept header
        const accept = req.headers.accept || "";
        if (!accept.includes("text/event-stream")) {
            const corsHeaders = this.getCorsHeaders(req);
            res.writeHead(406, { 
                "Content-Type": "application/json",
                ...corsHeaders
            });
            res.end(JSON.stringify({ error: "Not Acceptable: text/event-stream required" }));
            return;
        }

        // Criar stream ID
        const streamId = `${session.id}-${Date.now()}-${Math.random()}`;
        session.streams.add(streamId);

        // Inicializar event ID counter para este stream
        if (!this.eventIdCounter.has(session.id)) {
            this.eventIdCounter.set(session.id, 0);
        }

        // Verificar Last-Event-ID para resumability
        const lastEventId = req.headers["last-event-id"] as string | undefined;
        let eventId = this.eventIdCounter.get(session.id) || 0;

        if (lastEventId) {
            const lastId = parseInt(lastEventId, 10);
            if (!isNaN(lastId) && lastId >= eventId) {
                eventId = lastId + 1;
                logger.info("Resuming SSE stream", { streamId, lastEventId, newEventId: eventId });
            }
        }

        // Configurar SSE response com todos os headers de uma vez
        const corsHeaders = this.getCorsHeaders(req);
        const sseHeaders: Record<string, string> = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            ...corsHeaders,
        };

        // Adicionar session ID se existir
        if (session.id) {
            sseHeaders["Mcp-Session-Id"] = session.id;
        }

        res.writeHead(200, sseHeaders);

        this.streams.set(streamId, res);

        // Enviar evento de conexão
        this.sendSSEEvent(res, streamId, session.id, {
            type: "connection",
            streamId,
        }, eventId++);
        this.eventIdCounter.set(session.id, eventId);

        // Handle disconnect
        req.on("close", () => {
            this.streams.delete(streamId);
            session.streams.delete(streamId);
            logger.info("SSE stream closed", { streamId, sessionId: session.id });
        });

        logger.info("SSE stream opened", { streamId, sessionId: session.id });
    }

    /**
     * Handle POST request (JSON-RPC messages)
     * Conforme spec: "Sending Messages to the Server"
     */
    private async handlePostRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        session: Session
    ) {
        try {
            // Verificar Accept header
            const accept = req.headers.accept || "";
            const acceptsJson = accept.includes("application/json");
            const acceptsSSE = accept.includes("text/event-stream");

            if (!acceptsJson && !acceptsSSE) {
                const corsHeaders = this.getCorsHeaders(req);
                res.writeHead(406, { 
                    "Content-Type": "application/json",
                    ...corsHeaders
                });
                res.end(JSON.stringify({ error: "Not Acceptable: application/json or text/event-stream required" }));
                return;
            }

            // Ler body
            const body = await this.readRequestBody(req);
            let messages: JsonRpcMessage | JsonRpcBatch;

            try {
                messages = JSON.parse(body);
            } catch (error) {
                const corsHeaders = this.getCorsHeaders(req);
                res.writeHead(400, { 
                    "Content-Type": "application/json",
                    ...corsHeaders
                });
                res.end(JSON.stringify({
                    jsonrpc: "2.0",
                    error: {
                        code: -32700,
                        message: "Parse error",
                    },
                }));
                return;
            }

            // Normalizar para array
            const messageArray = Array.isArray(messages) ? messages : [messages];

            // Separar requests, responses e notifications
            const requests: JsonRpcRequest[] = [];
            const responses: JsonRpcResponse[] = [];
            const notifications: JsonRpcNotification[] = [];

            for (const msg of messageArray) {
                if ("id" in msg && "method" in msg) {
                    requests.push(msg as JsonRpcRequest);
                } else if ("id" in msg && ("result" in msg || "error" in msg)) {
                    responses.push(msg as JsonRpcResponse);
                } else if ("method" in msg && !("id" in msg)) {
                    notifications.push(msg as JsonRpcNotification);
                }
            }

            // Se há apenas responses ou notifications, retornar 202 Accepted
            if (requests.length === 0) {
                const corsHeaders = this.getCorsHeaders(req);
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                    ...corsHeaders,
                };
                if (session.id) {
                    headers["Mcp-Session-Id"] = session.id;
                }
                res.writeHead(202, headers);
                res.end();
                return;
            }

            // Processar requests
            const useSSE = acceptsSSE && requests.length > 0;
            
            if (useSSE) {
                // Iniciar SSE stream com todos os headers de uma vez
                const corsHeaders = this.getCorsHeaders(req);
                const sseHeaders: Record<string, string> = {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                    ...corsHeaders,
                };
                if (session.id) {
                    sseHeaders["Mcp-Session-Id"] = session.id;
                }
                res.writeHead(200, sseHeaders);

                // Processar requests e enviar responses via SSE
                for (const request of requests) {
                    const response = await this.handleJsonRpcRequest(request, session);
                    if (response) {
                        const eventId = (this.eventIdCounter.get(session.id) || 0) + 1;
                        this.eventIdCounter.set(session.id, eventId);
                        this.sendSSEEvent(res, `stream-${session.id}`, session.id, response, eventId);
                    }
                }

                // Fechar stream após todas as responses
                res.end();
            } else {
                // Retornar JSON response (single ou batch)
                const responses_array: JsonRpcResponse[] = [];
                for (const request of requests) {
                    const response = await this.handleJsonRpcRequest(request, session);
                    if (response) {
                        responses_array.push(response);
                    }
                }

                const corsHeaders = this.getCorsHeaders(req);
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                    ...corsHeaders,
                };
                if (session.id) {
                    headers["Mcp-Session-Id"] = session.id;
                }
                res.writeHead(200, headers);
                res.end(JSON.stringify(responses_array.length === 1 ? responses_array[0] : responses_array));
            }
        } catch (error: any) {
            logger.error("Error handling POST request", error);
            // Verificar se a resposta já foi enviada
            if (res.headersSent) {
                logger.warn("Response already sent, cannot send error response", {
                    error: error.message,
                });
                return;
            }
            
            const corsHeaders = this.getCorsHeaders(req);
            res.writeHead(500, { 
                "Content-Type": "application/json",
                ...corsHeaders
            });
            res.end(JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -32603,
                    message: error.message || "Internal error",
                },
            }));
        }
    }

    /**
     * Handle DELETE request (terminate session)
     */
    private async handleDeleteRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        session: Session
    ) {
        // Fechar todos os streams da sessão
        for (const streamId of session.streams) {
            const stream = this.streams.get(streamId);
            if (stream) {
                try {
                    stream.end();
                } catch (error) {
                    // Ignore
                }
                this.streams.delete(streamId);
            }
        }

        // Remover sessão
        this.sessions.delete(session.id);
        this.eventIdCounter.delete(session.id);

        const corsHeaders = this.getCorsHeaders(req);
        res.writeHead(200, { 
            "Content-Type": "application/json",
            ...corsHeaders
        });
        res.end(JSON.stringify({ status: "ok" }));

        logger.info("Session terminated", { sessionId: session.id });
    }

    /**
     * Processa uma requisição JSON-RPC
     */
    private async handleJsonRpcRequest(
        request: JsonRpcRequest,
        session: Session
    ): Promise<JsonRpcResponse | null> {
        const { method, params, id } = request;

        try {
            switch (method) {
                case "initialize":
                    return this.handleInitialize(params, session, id);

                case "tools/list":
                    return this.handleToolsList(id);

                case "tools/call":
                    return await this.handleToolsCall(params, id);

                case "ping":
                    return {
                        jsonrpc: "2.0",
                        id,
                        result: { pong: true },
                    };

                default:
                    return {
                        jsonrpc: "2.0",
                        id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${method}`,
                        },
                    };
            }
        } catch (error: any) {
            logger.error(`Error handling method: ${method}`, error);
            return {
                jsonrpc: "2.0",
                id,
                error: {
                    code: -32603,
                    message: error.message || "Internal error",
                    data: error.stack,
                },
            };
        }
    }

    /**
     * Handle initialize request
     */
    private handleInitialize(
        params: any,
        session: Session,
        requestId: string | number | null | undefined
    ): JsonRpcResponse {
        // Protocol version deve ser "2025-03-26" para Streamable HTTP
        return {
            jsonrpc: "2.0",
            id: requestId,
            result: {
                protocolVersion: "2025-03-26",
                capabilities: {
                    tools: {},
                },
                serverInfo: {
                    name: "autodesk-platform-services",
                    version: "0.0.1",
                },
            },
        };
    }

    /**
     * Handle tools/list request
     */
    private handleToolsList(requestId: string | number | null | undefined): JsonRpcResponse {
        try {
            const toolsList = Object.values(tools).map((tool) => {
                try {
                    const properties = this.schemaToJsonSchema(tool.schema);
                    const required = this.getRequiredFields(tool.schema);
                    
                    return {
                        name: tool.title,
                        description: tool.description,
                        inputSchema: {
                            type: "object",
                            properties,
                            required,
                        },
                    };
                } catch (error: any) {
                    logger.error(`Error processing tool schema: ${tool.title}`, error, {
                        toolName: tool.title,
                        schemaType: typeof tool.schema,
                    });
                    // Retornar schema vazio como fallback
                    return {
                        name: tool.title,
                        description: tool.description,
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: [],
                        },
                    };
                }
            });

            return {
                jsonrpc: "2.0",
                id: requestId,
                result: {
                    tools: toolsList,
                },
            };
        } catch (error: any) {
            logger.error("Error in handleToolsList", error);
            return {
                jsonrpc: "2.0",
                id: requestId,
                error: {
                    code: -32603,
                    message: error.message || "Internal error",
                },
            };
        }
    }

    /**
     * Handle tools/call request
     */
    private async handleToolsCall(
        params: any,
        requestId: string | number | null | undefined
    ): Promise<JsonRpcResponse> {
        if (!params || !params.name) {
            return {
                jsonrpc: "2.0",
                id: requestId,
                error: {
                    code: -32602,
                    message: "Invalid params: tool name is required",
                },
            };
        }

        const toolName = params.name;
        const toolArgs = params.arguments || {};

        // Encontrar tool
        const tool = Object.values(tools).find((t) => t.title === toolName);
        if (!tool) {
            return {
                jsonrpc: "2.0",
                id: requestId,
                error: {
                    code: -32601,
                    message: `Tool not found: ${toolName}`,
                },
            };
        }

        logger.info("Calling tool", { toolName, requestId });

        try {
            // Chamar tool callback
            // ToolCallback espera (args, context) mas podemos passar só args
            const result = await (tool.callback as any)(toolArgs, {});

            return {
                jsonrpc: "2.0",
                id: requestId,
                result,
            };
        } catch (error: any) {
            logger.error(`Error calling tool: ${toolName}`, error);
            return {
                jsonrpc: "2.0",
                id: requestId,
                error: {
                    code: -32603,
                    message: error.message || "Internal error",
                    data: error.stack,
                },
            };
        }
    }

    /**
     * Converte schema Zod para JSON Schema
     * Trata schemas vazios e valores undefined/null
     * Suporta tanto objetos planos (ZodRawShape) quanto z.object() instanciado
     */
    private schemaToJsonSchema(schema: any): Record<string, any> {
        const properties: Record<string, any> = {};
        
        // Se schema é vazio ou não existe, retornar objeto vazio
        if (!schema || typeof schema !== "object") {
            return properties;
        }
        
        // Verificar se é um z.object() instanciado (tem _def.shape)
        if (schema._def && schema._def.typeName === "ZodObject" && schema._def.shape) {
            // Se for um z.object() instanciado, usar o shape
            return this.schemaToJsonSchema(schema._def.shape);
        }
        
        // Se schema é um objeto vazio, retornar objeto vazio
        if (Object.keys(schema).length === 0) {
            return properties;
        }
        
        for (const [key, value] of Object.entries(schema)) {
            // Pular propriedades que não são do schema (como métodos, símbolos, etc.)
            if (key.startsWith("_") || typeof value === "function") {
                continue;
            }
            
            // Validar se o valor existe e é um objeto
            if (!value || typeof value !== "object") {
                logger.warn("Invalid schema value for key", { key, valueType: typeof value, value });
                continue;
            }
            
            const zodSchema = value as any;
            
            // Validar se é um schema Zod válido
            // Verificar se tem _def E se _def tem typeName
            if (zodSchema && typeof zodSchema === "object" && zodSchema._def) {
                if (zodSchema._def.typeName) {
                    try {
                        properties[key] = this.zodToJsonSchema(zodSchema);
                    } catch (error: any) {
                        logger.warn("Error converting Zod schema to JSON Schema", {
                            key,
                            error: error.message,
                            stack: error.stack,
                            typeName: zodSchema._def?.typeName,
                        });
                        // Fallback para string se houver erro
                        properties[key] = { type: "string" };
                    }
                } else {
                    // Tem _def mas não tem typeName - usar fallback
                    logger.debug("Schema value has _def but no typeName, using fallback", { key });
                    properties[key] = { type: "string" };
                }
            } else {
                // Se não for um schema Zod válido, usar fallback
                logger.debug("Schema value is not a valid Zod schema, using fallback", { 
                    key,
                    hasDef: !!zodSchema?._def,
                });
                properties[key] = { type: "string" };
            }
        }
        
        return properties;
    }

    /**
     * Converte um tipo Zod para JSON Schema
     * Com validações de segurança para evitar erros
     * Suporta tipos compostos como ZodEffects (z.string().nonempty(), z.string().min(), etc.)
     */
    private zodToJsonSchema(zodSchema: any): any {
        // Validar entrada
        if (!zodSchema || typeof zodSchema !== "object") {
            return { type: "string" };
        }
        
        const def = zodSchema._def;
        if (!def || !def.typeName) {
            return { type: "string" };
        }
        
        try {
            switch (def.typeName) {
                case "ZodString":
                    return { type: "string" };
                    
                case "ZodNumber":
                    return { type: "number" };
                    
                case "ZodBoolean":
                    return { type: "boolean" };
                    
                case "ZodArray":
                    // Validar innerType antes de usar
                    if (def.innerType) {
                        if (typeof def.innerType === "object" && def.innerType !== null) {
                            // Verificar se tem _def antes de chamar recursivamente
                            if (def.innerType._def && def.innerType._def.typeName) {
                                try {
                                    return {
                                        type: "array",
                                        items: this.zodToJsonSchema(def.innerType),
                                    };
                                } catch (error: any) {
                                    logger.debug("Error processing ZodArray innerType", {
                                        error: error.message,
                                        innerTypeType: def.innerType?._def?.typeName,
                                    });
                                }
                            }
                        }
                    }
                    return { type: "array", items: { type: "string" } };
                    
                case "ZodEnum":
                    if (def.values && Array.isArray(def.values)) {
                        return {
                            type: "string",
                            enum: def.values,
                        };
                    }
                    return { type: "string" };
                    
                case "ZodOptional":
                    // Validar innerType antes de usar recursivamente
                    if (def.innerType) {
                        if (typeof def.innerType === "object" && def.innerType !== null) {
                            // Verificar se tem _def antes de chamar recursivamente
                            if (def.innerType._def && def.innerType._def.typeName) {
                                try {
                                    return this.zodToJsonSchema(def.innerType);
                                } catch (error: any) {
                                    logger.debug("Error processing ZodOptional innerType", {
                                        error: error.message,
                                        innerTypeType: def.innerType?._def?.typeName,
                                    });
                                }
                            }
                        }
                    }
                    // Fallback: campo opcional sem tipo conhecido = qualquer tipo
                    return { type: "string" };
                    
                case "ZodDefault":
                    // Validar innerType antes de usar recursivamente
                    if (def.innerType) {
                        if (typeof def.innerType === "object" && def.innerType !== null) {
                            // Verificar se tem _def antes de chamar recursivamente
                            if (def.innerType._def && def.innerType._def.typeName) {
                                try {
                                    return this.zodToJsonSchema(def.innerType);
                                } catch (error: any) {
                                    logger.debug("Error processing ZodDefault innerType", {
                                        error: error.message,
                                        innerTypeType: def.innerType?._def?.typeName,
                                    });
                                }
                            }
                        }
                    }
                    // Fallback: campo com default sem tipo conhecido = qualquer tipo
                    return { type: "string" };
                    
                case "ZodEffects":
                    // ZodEffects é usado para validações como .refine(), .transform(), etc.
                    // Precisamos extrair o schema interno (pode estar em def.schema ou def.innerType)
                    let innerSchema = def.schema || def.innerType;
                    if (innerSchema && typeof innerSchema === "object" && innerSchema._def && innerSchema._def.typeName) {
                        try {
                            return this.zodToJsonSchema(innerSchema);
                        } catch (error: any) {
                            logger.debug("Error processing ZodEffects schema", {
                                error: error.message,
                            });
                        }
                    }
                    // Se não conseguir extrair, assumir string (mais comum)
                    return { type: "string" };
                    
                case "ZodObject":
                    // Se for um objeto Zod, converter suas propriedades
                    if (def.shape && typeof def.shape === "object") {
                        try {
                            return {
                                type: "object",
                                properties: this.schemaToJsonSchema(def.shape),
                                required: this.getRequiredFields(def.shape),
                            };
                        } catch (error: any) {
                            logger.debug("Error processing ZodObject shape", {
                                error: error.message,
                            });
                        }
                    }
                    return { type: "object" };
                    
                case "ZodRecord":
                    // z.record() - objeto com chaves dinâmicas
                    return { type: "object", additionalProperties: true };
                    
                default:
                    logger.debug("Unknown Zod type, using string fallback", {
                        typeName: def.typeName,
                    });
                    return { type: "string" };
            }
        } catch (error: any) {
            logger.warn("Error in zodToJsonSchema", {
                typeName: def?.typeName || "unknown",
                error: error.message,
                stack: error.stack,
            });
            return { type: "string" };
        }
    }

    /**
     * Obtém campos obrigatórios do schema
     * Com validações de segurança
     * Suporta tipos compostos como ZodEffects, ZodOptional, ZodDefault
     * Suporta tanto objetos planos (ZodRawShape) quanto z.object() instanciado
     */
    private getRequiredFields(schema: any): string[] {
        const required: string[] = [];
        
        // Se schema é vazio ou não existe, retornar array vazio
        if (!schema || typeof schema !== "object") {
            return required;
        }
        
        // Verificar se é um z.object() instanciado (tem _def.shape)
        if (schema._def && schema._def.typeName === "ZodObject" && schema._def.shape) {
            // Se for um z.object() instanciado, usar o shape
            return this.getRequiredFields(schema._def.shape);
        }
        
        // Se schema é um objeto vazio, retornar array vazio
        if (Object.keys(schema).length === 0) {
            return required;
        }
        
        for (const [key, value] of Object.entries(schema)) {
            // Pular propriedades que não são do schema (como métodos, símbolos, etc.)
            if (key.startsWith("_") || typeof value === "function") {
                continue;
            }
            
            // Validar se o valor existe
            if (!value || typeof value !== "object") {
                continue;
            }
            
            const zodSchema = value as any;
            
            // Validar se é um schema Zod válido
            if (zodSchema && typeof zodSchema === "object" && zodSchema._def && zodSchema._def.typeName) {
                const def = zodSchema._def;
                
                // Verificar se é opcional ou tem valor padrão
                if (def.typeName === "ZodOptional" || def.typeName === "ZodDefault") {
                    // Campo não é obrigatório
                    continue;
                }
                
                // Se for ZodEffects, verificar o schema interno
                if (def.typeName === "ZodEffects") {
                    // ZodEffects pode envolver um Optional, então precisamos verificar recursivamente
                    const innerSchema = def.schema || def.innerType;
                    if (innerSchema && typeof innerSchema === "object" && innerSchema._def && innerSchema._def.typeName) {
                        const innerDef = innerSchema._def;
                        // Se o schema interno for Optional ou Default, não é obrigatório
                        if (innerDef.typeName === "ZodOptional" || innerDef.typeName === "ZodDefault") {
                            continue;
                        }
                    }
                    // ZodEffects sem Optional interno = obrigatório
                    required.push(key);
                    continue;
                }
                
                // Todos os outros tipos são obrigatórios
                required.push(key);
            }
        }
        
        return required;
    }

    /**
     * Envia um evento SSE
     */
    private sendSSEEvent(
        res: http.ServerResponse,
        streamId: string,
        sessionId: string,
        data: any,
        eventId?: number
    ) {
        let message = "";
        if (eventId !== undefined) {
            message += `id: ${eventId}\n`;
        }
        message += `data: ${JSON.stringify(data)}\n\n`;
        res.write(message);
    }

    /**
     * Lê o body da requisição
     */
    private readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", () => {
                resolve(body);
            });
            req.on("error", reject);
        });
    }

    /**
     * Inicia o servidor
     */
    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, this.host, () => {
                logger.info("MCP HTTP Server started", {
                    host: this.host,
                    port: this.port,
                    endpoint: this.mcpEndpoint,
                });
                resolve();
            });

            this.server.on("error", (error) => {
                logger.error("Server error", error);
                reject(error);
            });
        });
    }

    /**
     * Para o servidor
     */
    public stop(): Promise<void> {
        return new Promise((resolve) => {
            // Fechar todos os streams
            for (const [streamId, res] of this.streams.entries()) {
                try {
                    res.end();
                } catch (error) {
                    // Ignore
                }
            }
            this.streams.clear();
            this.sessions.clear();
            this.eventIdCounter.clear();

            // Fechar servidor
            this.server.close(() => {
                logger.info("MCP HTTP Server stopped");
                resolve();
            });
        });
    }
}

export default MCPHttpServer;
