import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
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
            
            const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
            
            // Remove "b." prefix from projectId if present
            const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
            
            if (!projectIdClean || projectIdClean.trim() === "") {
                throw new Error("projectId is required and cannot be empty");
            }
            
            const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/users`;
            
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
            
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Could not add user to project (HTTP ${response.status})`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.developerMessage || errorJson.message || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                
                throw new Error(JSON.stringify({
                    error: "Failed to add user to project",
                    message: errorMessage,
                    projectId: projectIdClean,
                    email: email || undefined,
                    userId: userId || undefined,
                    statusCode: response.status,
                    url: url
                }));
            }
            
            const user = await response.json();
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
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            const errorDetails = {
                error: "Failed to add user to project",
                message: errorMessage,
                projectId: projectId?.replace(/^b\./, "") || "unknown",
                email: email || undefined,
                userId: userId || undefined,
                ...(error?.response?.status && { statusCode: error.response.status }),
                ...(error?.response?.data && { apiError: error.response.data })
            };
            
            throw new Error(JSON.stringify(errorDetails));
        }
    }
};

