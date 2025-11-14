import { z } from "zod";
import type { Tool } from "./common.js";

const schema = {
    redirectUri: z.string().url().optional(),
    scopes: z.array(z.string()).optional(),
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const getOAuthAuthorizationUrl: Tool<typeof schema> = {
    title: "get-oauth-authorization-url",
    description:
        "Get OAuth2 authorization URL to redirect user for authentication with Autodesk",
    schema,
    callback: async ({ redirectUri, scopes }, context?: { session?: any }) => {
        // Esta tool apenas retorna informações sobre como obter a URL
        // O frontend deve chamar diretamente o endpoint /oauth/authorize
        // ou podemos fazer uma chamada HTTP interna aqui
        
        // Por enquanto, retornamos instruções
        // Em uma implementação completa, poderíamos fazer uma chamada HTTP interna
        // ao servidor para obter a URL
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        message:
                            "To get OAuth2 authorization URL, make a GET request to /oauth/authorize endpoint",
                        endpoint: "/oauth/authorize",
                        method: "GET",
                        queryParams: {
                            redirect_uri: redirectUri || "optional",
                            scopes: scopes?.join(" ") || "optional",
                        },
                        note: "The server will return authorizationUrl, state, and sessionId",
                    }),
                },
            ],
        };
    },
};

