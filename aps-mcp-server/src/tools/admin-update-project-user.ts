import { z } from "zod";
import { getCachedClientCredentialsAccessToken, cleanProjectId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
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
        try {
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const projectIdClean = cleanProjectId(projectId);
            const url = buildApiUrl(`construction/admin/v1/projects/${projectIdClean}/users/${userId}`);
            
            const userData: any = {};
            if (roleIds) userData.roleIds = roleIds;
            if (permissions) userData.permissions = permissions;
            if (companyId) userData.companyId = companyId;
            
            const response = await fetchWithTimeout(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            }, 30000, 0); // Sem retry para PATCH
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "update project user", projectId: projectIdClean, userId });
            }
            
            const user = await response.json() as any;
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(user)
                }]
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to update project user",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId?.replace(/^b\./, "") || "unknown",
                userId: userId || "unknown"
            }));
        }
    }
};

