import { z } from "zod";
import { getAccessToken, getCachedClientCredentialsAccessToken, cleanProjectId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    userId: z.string().min(1).optional(),
    email: z.string().email().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminRemoveProjectUser: Tool<typeof schema> = {
    title: "admin-remove-project-user",
    description: "Remove a user from a project in Autodesk Construction Cloud using Admin API. Can use either userId or email to identify the user.",
    schema,
    callback: async ({ projectId, userId, email }: SchemaType) => {
        if (!userId && !email) {
            throw new Error("Either userId or email must be provided");
        }
        
        try {
            const projectIdClean = cleanProjectId(projectId);
            
            // Se apenas email foi fornecido, buscar o userId primeiro (precisa de account:read)
            if (!userId && email) {
                const readToken = await getAccessToken(["account:read"]);
                
                // Buscar usuários do projeto para encontrar o userId pelo email
                const usersUrl = buildApiUrl(`construction/admin/v1/projects/${projectIdClean}/users`);
                const usersResponse = await fetchWithTimeout(usersUrl, {
                    headers: {
                        "Authorization": `Bearer ${readToken}`
                    }
                }, 30000, 2); // Retry para GET
                
                if (!usersResponse.ok) {
                    throw await handleApiError(usersResponse, { operation: "retrieve project users", projectId: projectIdClean });
                }
                
                const usersData = await usersResponse.json() as any;
                
                // A API pode retornar em diferentes formatos: { data: [...], results: [...], ou array direto }
                let users: any[] = [];
                if (Array.isArray(usersData)) {
                    users = usersData;
                } else if (usersData.data && Array.isArray(usersData.data)) {
                    users = usersData.data;
                } else if (usersData.results && Array.isArray(usersData.results)) {
                    users = usersData.results;
                } else if (usersData.users && Array.isArray(usersData.users)) {
                    users = usersData.users;
                } else if (usersData.items && Array.isArray(usersData.items)) {
                    users = usersData.items;
                }
                
                // Buscar usuário por email (verificar diferentes campos possíveis)
                const searchEmail = email.toLowerCase();
                const user = users.find((u: any) => {
                    const userEmail = (u.email || u.emailAddress || u.userEmail || "").toLowerCase();
                    return userEmail === searchEmail;
                });
                
                if (!user) {
                    throw new Error(`User with email ${email} not found in project ${projectIdClean}. Found ${users.length} users in project.`);
                }
                
                // Obter userId de diferentes campos possíveis
                const foundUserId = user.id || user.userId || user.accountId;
                if (!foundUserId) {
                    throw new Error(`User found but userId is missing. User data: ${JSON.stringify(user)}`);
                }
                
                userId = foundUserId;
            }
            
            if (!userId) {
                throw new Error("userId is required");
            }
            
            // Agora usar token com account:write para remover
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const url = buildApiUrl(`construction/admin/v1/projects/${projectIdClean}/users/${userId}`);
            
            const response = await fetchWithTimeout(url, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            }, 30000, 0); // Sem retry para DELETE
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "remove user from project", projectId: projectIdClean, userId, email });
            }
            
            // DELETE requests might not return content
            if (response.status === 204 || response.status === 200) {
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({ success: true, message: "User removed successfully", userId, email: email || undefined })
                    }]
                };
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
                error: "Failed to remove user from project",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId?.replace(/^b\./, "") || "unknown",
                userId: userId || undefined,
                email: email || undefined
            }));
        }
    }
};

