import { randomBytes, createHash } from "node:crypto";
import fetch from "node-fetch";
import { logger } from "../utils/logger.js";

/**
 * Codifica bytes em base64url (URL-safe base64)
 */
function base64URLEncode(buffer: Buffer): string {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

/**
 * Gera um code_verifier para PKCE (43-128 caracteres, URL-safe)
 */
export function generateCodeVerifier(): string {
    const bytes = randomBytes(32);
    return base64URLEncode(bytes);
}

/**
 * Gera um code_challenge a partir do code_verifier (SHA256 hash, base64url encoded)
 */
export function generateCodeChallenge(verifier: string): string {
    const hash = createHash("sha256").update(verifier).digest();
    return base64URLEncode(hash);
}

/**
 * Gera um state aleatório para prevenir CSRF
 */
export function generateState(): string {
    return randomBytes(16).toString("hex");
}

/**
 * Resposta do token OAuth2
 */
export interface OAuth2TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
}

/**
 * Troca código de autorização por token de acesso (PKCE flow)
 */
export async function exchangeAuthorizationCode(
    clientId: string,
    code: string,
    codeVerifier: string,
    redirectUri: string
): Promise<OAuth2TokenResponse> {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
    });

    const response = await fetch(
        "https://developer.api.autodesk.com/authentication/v2/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        logger.error("Failed to exchange authorization code", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
        });
        throw new Error(
            `Failed to exchange authorization code: ${response.status} ${response.statusText} - ${errorText}`
        );
    }

    const tokens = (await response.json()) as OAuth2TokenResponse;
    logger.debug("Authorization code exchanged for token", {
        expiresIn: tokens.expires_in,
        hasRefreshToken: !!tokens.refresh_token,
    });

    return tokens;
}

/**
 * Atualiza token de acesso usando refresh token
 */
export async function refreshAccessToken(
    clientId: string,
    refreshToken: string
): Promise<OAuth2TokenResponse> {
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
    });

    const response = await fetch(
        "https://developer.api.autodesk.com/authentication/v2/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        logger.error("Failed to refresh access token", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
        });
        throw new Error(
            `Failed to refresh access token: ${response.status} ${response.statusText} - ${errorText}`
        );
    }

    const tokens = (await response.json()) as OAuth2TokenResponse;
    logger.debug("Access token refreshed", {
        expiresIn: tokens.expires_in,
        hasRefreshToken: !!tokens.refresh_token,
    });

    return tokens;
}

