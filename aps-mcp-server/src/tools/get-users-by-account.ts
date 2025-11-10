import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";
import { DataManagementClient } from "@aps_sdk/data-management";

const schema = {
    accountId: z.string().nonempty()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const getUsersByAccount: Tool<typeof schema> = {
    title: "get-users-by-account",
    description: "Query all the users in a specific Autodesk Construction Cloud account by aggregating users from all projects.",
    schema,
    callback: async ({ accountId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read", "data:read"]);
        
        // Remove "b." prefix from accountId if present
        const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
        
        try {
            // First, try the Admin API directly
            const url = `https://developer.api.autodesk.com/admin/v1/users?accountId=${accountIdClean}`;
            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const users = data.data || data.users || data;
                return {
                    content: Array.isArray(users) ? users.map((user: any) => ({
                        type: "text",
                        text: JSON.stringify({ 
                            id: user.id, 
                            email: user.email, 
                            name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() 
                        })
                    })) : [{
                        type: "text",
                        text: JSON.stringify(users)
                    }]
                };
            }
        } catch (error) {
            // If Admin API fails, fall back to aggregating from projects
        }
        
        // Fallback: Get users from all projects in the account
        try {
            const dataManagementClient = new DataManagementClient();
            // getHubProjects expects accountId with "b." prefix
            const projects = await dataManagementClient.getHubProjects(accountId, { accessToken });
            
            if (!projects.data || projects.data.length === 0) {
                throw new Error(`No projects found in account ${accountId}. Cannot retrieve users.`);
            }
            
            const allUsers = new Map<string, any>();
            
            // Get users from each project
            for (const project of projects.data) {
                const projectId = project.id?.replace("b.", "") || project.id;
                try {
                    const usersUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users`;
                    const usersResponse = await fetch(usersUrl, {
                        headers: {
                            "Authorization": `Bearer ${accessToken}`
                        }
                    });
                    
                    if (usersResponse.ok) {
                        const usersData = await usersResponse.json();
                        // Handle different response formats: results, data, users, or direct array
                        const users = usersData.results || usersData.data || usersData.users || (Array.isArray(usersData) ? usersData : []);
                        
                        if (Array.isArray(users) && users.length > 0) {
                            for (const user of users) {
                                const userId = user.id || user.email || user.userId;
                                if (userId && !allUsers.has(userId)) {
                                    allUsers.set(userId, {
                                        id: user.id || user.userId,
                                        email: user.email || user.emailAddress,
                                        name: user.name || user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "N/A"
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    // Continue with next project if one fails
                    continue;
                }
            }
            
            if (allUsers.size === 0) {
                throw new Error(`Could not retrieve users from any project in account ${accountId}. The Admin API may require specific permissions.`);
            }
            
            return {
                content: Array.from(allUsers.values()).map((user: any) => ({
                    type: "text",
                    text: JSON.stringify(user)
                }))
            };
        } catch (error: any) {
            throw new Error(`Could not retrieve users: ${error.message}`);
        }
    }
};
