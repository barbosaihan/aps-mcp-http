import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    userId: z.string().min(1, "userId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetUserRoles: Tool<typeof schema> = {
    title: "admin-get-user-roles",
    description: "Get all roles for a specific user in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ userId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        const url = `https://developer.api.autodesk.com/admin/v1/users/${userId}/roles`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not retrieve user roles: ${await response.text()}`);
        }
        
        const data = await response.json();
        const roles = data.data || data.roles || data;
        return {
            content: Array.isArray(roles) ? roles.map((role: any) => ({
                type: "text" as const,
                text: JSON.stringify(role)
            })) : [{
                type: "text" as const,
                text: JSON.stringify(roles)
            }]
        };
    }
};

