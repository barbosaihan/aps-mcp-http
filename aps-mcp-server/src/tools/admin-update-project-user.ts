import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    userId: z.string().min(1, "userId is required"),
    roleIds: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    companyId: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminUpdateProjectUser: Tool<typeof schema> = {
    title: "admin-update-project-user",
    description: "Update a user's information in a project using Admin API",
    schema,
    callback: async ({ projectId, userId, roleIds, permissions, companyId }: SchemaType) => {
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/users/${userId}`;
        
        const userData: any = {};
        if (roleIds) userData.roleIds = roleIds;
        if (permissions) userData.permissions = permissions;
        if (companyId) userData.companyId = companyId;
        
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            throw new Error(`Could not update user: ${await response.text()}`);
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

