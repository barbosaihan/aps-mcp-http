import path from "node:path";
import url from "node:url";
import dotenv from "dotenv";
import fs from "fs";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SA_ID, APS_SA_EMAIL, APS_SA_KEY_ID, APS_SA_PRIVATE_KEY, APS_REDIRECT_URI } = process.env;

// Path para armazenar tokens de usuário
const USER_CREDENTIALS_PATH = path.resolve(__dirname, "..", ".user_credentials.json");

/**
 * Loads user credentials from disk
 */
export function loadUserCredentials(): { access_token: string; refresh_token: string; expires_at: number } | null {
    try {
        if (fs.existsSync(USER_CREDENTIALS_PATH)) {
            const data = fs.readFileSync(USER_CREDENTIALS_PATH, "utf-8");
            return JSON.parse(data);
        }
    } catch (error) {
        console.error("Error loading user credentials:", error);
    }
    return null;
}

/**
 * Saves user credentials to disk
 */
export function saveUserCredentials(credentials: { access_token: string; refresh_token?: string; expires_in: number }) {
    try {
        const data = {
            access_token: credentials.access_token,
            refresh_token: credentials.refresh_token || "",
            expires_at: Date.now() + (credentials.expires_in * 1000)
        };
        fs.writeFileSync(USER_CREDENTIALS_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error saving user credentials:", error);
        throw error;
    }
}

export {
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    APS_SA_ID,
    APS_SA_EMAIL,
    APS_SA_KEY_ID,
    APS_SA_PRIVATE_KEY,
    APS_REDIRECT_URI,
    USER_CREDENTIALS_PATH
}