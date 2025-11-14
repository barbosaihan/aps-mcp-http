import { z } from "zod";
import { getCachedClientCredentialsAccessToken, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    users: z.array(z.object({
        email: z.string().email(),
        companyId: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        jobTitle: z.string().optional(),
        roleIds: z.array(z.string()).optional()
    }))
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminImportAccountUsers: Tool<typeof schema> = {
    title: "admin-import-account-users",
    description: "Import multiple users to an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ users }: SchemaType) => {
        try {
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const url = buildApiUrl(`admin/v1/users/import`);
            
            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ users })
            }, 30000, 0); // Sem retry para POST
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "import account users", userCount: users.length });
            }
            
            const result = await response.json() as any;
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(result)
                }]
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to import account users",
                message: error?.message || error?.toString() || "Unknown error",
                userCount: users.length
            }));
        }
    }
};

