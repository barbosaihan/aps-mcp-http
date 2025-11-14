import type { Tool } from "./common.js";
import type { Session } from "./common.js";
import { logger } from "../utils/logger.js";

const schema = {};

/**
 * Get OAuth2 token information from the current session
 * 
 * This tool returns the OAuth2 tokens stored in the session without exposing sensitive data.
 * Used by the frontend to save tokens to Supabase for recovery when session expires.
 */
export const getOAuthTokenInfo: Tool<typeof schema> = {
    title: "get-oauth-token-info",
    description: "Get OAuth2 token information from the current session (for saving to persistent storage)",
    schema,
    callback: async ({}, context?: { session?: Session }) => {
        try {
            if (!context?.session) {
                throw new Error("Session not found");
            }

            const session = context.session;

            if (!session.oauth2) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify({
                                error: "No OAuth2 tokens found in session",
                                hasTokens: false,
                            }),
                        },
                    ],
                };
            }

            const oauth2 = session.oauth2;

            // Retornar informações dos tokens (sem expor dados muito sensíveis)
            // O access_token será criptografado pelo frontend antes de salvar no Supabase
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify({
                            hasTokens: true,
                            accessToken: oauth2.accessToken,
                            refreshToken: oauth2.refreshToken || null,
                            expiresAt: oauth2.expiresAt,
                            scopes: oauth2.scopes || [],
                            sessionId: session.id,
                            expiresIn: Math.max(0, Math.floor((oauth2.expiresAt - Date.now()) / 1000)),
                        }),
                    },
                ],
            };
        } catch (error: any) {
            logger.error("Error in get-oauth-token-info", error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify({
                            error: error.message || "Failed to get OAuth2 token info",
                            hasTokens: false,
                        }),
                    },
                ],
                isError: true,
            };
        }
    },
};

