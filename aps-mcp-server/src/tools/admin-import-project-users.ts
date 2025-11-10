import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    users: z.array(z.object({
        email: z.string().email().optional(),
        userId: z.string().optional(),
        companyId: z.string().optional(),
        roleIds: z.array(z.string()).optional(),
        permissions: z.array(z.string()).optional()
    }))
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminImportProjectUsers: Tool<typeof schema> = {
    title: "admin-import-project-users",
    description: "Import multiple users to a project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ projectId, users }: SchemaType) => {
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/users:import`;
        
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

