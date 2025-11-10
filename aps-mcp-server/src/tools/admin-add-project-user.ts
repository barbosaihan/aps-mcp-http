import { z } from "zod";
import { getCachedClientCredentialsAccessToken, cleanProjectId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    email: z.string().email().optional(),
    userId: z.string().min(1).optional(),
    companyId: z.string().optional(),
    roleIds: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminAddProjectUser: Tool<typeof schema> = {
    title: "admin-add-project-user",
    description: "Add a user to a project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ projectId, email, userId, companyId, roleIds, permissions }: SchemaType) => {
        try {
            if (!email && !userId) {
                throw new Error("Either email or userId must be provided");
            }
            
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const projectIdClean = cleanProjectId(projectId);
            
            if (!projectIdClean || projectIdClean.trim() === "") {
                throw new Error("projectId is required and cannot be empty");
            }
            
            const url = buildApiUrl(`construction/admin/v1/projects/${projectIdClean}/users`);
            
            const userData: any = {};
            if (email) userData.email = email;
            if (userId) userData.userId = userId;
            if (companyId) userData.companyId = companyId;
            if (roleIds) userData.roleIds = roleIds;
            if (permissions) userData.permissions = permissions;
            // products é obrigatório na API - usar array vazio para dar acesso a todos os produtos disponíveis
            if (!userData.products) {
                userData.products = [];
            }
            
            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            }, 30000, 0); // Sem retry para POST
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "add user to project", projectId: projectIdClean, email, userId });
            }
            
            const user = await response.json() as any;
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        id: user.id,
                        email: user.email,
                        projectId: projectIdClean,
                        ...user
                    })
                }]
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to add user to project",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId?.replace(/^b\./, "") || "unknown",
                email: email || undefined,
                userId: userId || undefined
            }));
        }
    }
};

