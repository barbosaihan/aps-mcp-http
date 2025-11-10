import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
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
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        const url = `https://developer.api.autodesk.com/admin/v1/users/import`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ users })
        });
        
        if (!response.ok) {
            throw new Error(`Could not import users: ${await response.text()}`);
        }
        
        const result = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(result)
            }]
        };
    }
};

