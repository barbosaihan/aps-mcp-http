import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    userId: z.string().min(1, "userId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetAccountUser: Tool<typeof schema> = {
    title: "admin-get-account-user",
    description: "Get detailed information about a specific user in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ userId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        const url = `https://developer.api.autodesk.com/admin/v1/users/${userId}`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not retrieve user: ${await response.text()}`);
        }
        
        const user = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(user)
            }]
        };
    }
};

