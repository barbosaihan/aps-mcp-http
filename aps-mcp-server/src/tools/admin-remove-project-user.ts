import { z } from "zod";
import { getAccessToken } from "./common.js";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
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
        
        // Se apenas email foi fornecido, buscar o userId primeiro (precisa de account:read)
        if (!userId && email) {
            const readToken = await getAccessToken(["account:read"]);
            
            // Remove "b." prefix from projectId if present
            const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
            // Buscar usuários do projeto para encontrar o userId pelo email
            const usersUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/users`;
            const usersResponse = await fetch(usersUrl, {
                headers: {
                    "Authorization": `Bearer ${readToken}`
                }
            });
            
            if (!usersResponse.ok) {
                throw new Error(`Could not retrieve project users: ${await usersResponse.text()}`);
            }
            
            const usersData = await usersResponse.json();
            
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
                throw new Error(`User with email ${email} not found in project ${projectId}. Found ${users.length} users in project.`);
            }
            
            // Obter userId de diferentes campos possíveis
            const foundUserId = user.id || user.userId || user.accountId;
            if (!foundUserId) {
                throw new Error(`User found but userId is missing. User data: ${JSON.stringify(user)}`);
            }
            
            userId = foundUserId;
        }
        
        // Agora usar token com account:write para remover
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        
        // Remove "b." prefix from projectId if present (já pode ter sido limpo acima)
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/users/${userId}`;
        
        const response = await fetch(url, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not remove user from project: ${await response.text()}`);
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
        
        const result = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(result)
            }]
        };
    }
};

