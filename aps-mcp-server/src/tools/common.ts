import { ZodRawShape } from "zod";
import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SA_ID, APS_SA_KEY_ID, APS_SA_PRIVATE_KEY, APS_REDIRECT_URI, loadUserCredentials, saveUserCredentials } from "../config.js";
import { getServiceAccountAccessToken, refreshUserAccessToken } from "../auth.js";

export interface Tool<Args extends ZodRawShape> {
    title: string;
    description: string;
    schema: Args;
    callback: ToolCallback<Args>;
}

const credentialsCache = new Map<string, { accessToken: string, expiresAt: number }>();

export async function getAccessToken(scopes: string[]): Promise<string> {
    const cacheKey = scopes.join("+");
    let credentials = credentialsCache.get(cacheKey);
    if (!credentials || credentials.expiresAt < Date.now()) {
        const { access_token, expires_in } = await getServiceAccountAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, APS_SA_ID!, APS_SA_KEY_ID!, APS_SA_PRIVATE_KEY!, scopes);
        credentials = {
            accessToken: access_token,
            expiresAt: Date.now() + expires_in * 1000
        };
        credentialsCache.set(cacheKey, credentials);
    }
    return credentials.accessToken;
}

/**
 * Gets user access token for 3-legged OAuth.
 * Tries to use cached token, refreshes if expired.
 * Returns null if no user credentials are available.
 */
export async function getUserAccessToken(scopes: string[]): Promise<string | null> {
    const userCreds = loadUserCredentials();
    if (!userCreds || !userCreds.refresh_token) {
        return null;
    }

    // Check if token is still valid (with 5 minute buffer)
    if (userCreds.expires_at > Date.now() + 5 * 60 * 1000) {
        return userCreds.access_token;
    }

    // Refresh token
    try {
        if (!APS_REDIRECT_URI) {
            throw new Error("APS_REDIRECT_URI not configured");
        }
        const newCredentials = await refreshUserAccessToken(
            APS_CLIENT_ID!,
            APS_CLIENT_SECRET!,
            APS_REDIRECT_URI,
            userCreds.refresh_token
        );
        saveUserCredentials(newCredentials);
        return newCredentials.access_token;
    } catch (error: any) {
        console.error("Error refreshing user token:", error.message);
        return null;
    }
}