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
    callback: async ({ code, state, sessionId }, context?: { session?: any }) => {
        // Esta tool apenas retorna informações sobre como trocar o código
        // O frontend deve chamar diretamente o endpoint /oauth/callback
        // ou podemos fazer uma chamada HTTP interna aqui
        
        // Por enquanto, retornamos instruções
        // Em uma implementação completa, poderíamos fazer uma chamada HTTP interna
        // ao servidor para trocar o código
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        message:
                            "To exchange OAuth2 authorization code, make a GET request to /oauth/callback endpoint",
                        endpoint: "/oauth/callback",
                        method: "GET",
                        queryParams: {
                            code: "required",
                            state: "required",
                        },
                        headers: {
                            "mcp-session-id": sessionId || "optional (will create new session if not provided)",
                        },
                        note: "The server will exchange the code for tokens and store them in the session",
                    }),
                },
            ],
        };
    },
};

