import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required"),
    companyId: z.string().optional(),
    roleId: z.string().optional(),
    status: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetAccountUsers: Tool<typeof schema> = {
    title: "admin-get-account-users",
    description: "Get all users in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ accountId, companyId, roleId, status }: SchemaType) => {
        try {
            const accessToken = await getAccessToken(["account:read"]);
            
            // Remove "b." prefix from accountId if present
            const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
            
            if (!accountIdClean || accountIdClean.trim() === "") {
                throw new Error("accountId is required and cannot be empty");
            }
            
            // Use the Construction Admin API endpoint (same pattern as admin-get-account-projects)
            let url = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountIdClean}/users`;
            
            const params = new URLSearchParams();
            if (companyId) params.append("companyId", companyId);
            if (roleId) params.append("roleId", roleId);
            if (status) params.append("status", status);
            
            if (params.toString()) {
                url += `?${params.toString()}`;
            }
            
            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Could not retrieve users (HTTP ${response.status})`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.developerMessage || errorJson.message || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                
                throw new Error(JSON.stringify({
                    error: "Failed to get account users",
                    message: errorMessage,
                    accountId: accountIdClean,
                    statusCode: response.status,
                    url: url
                }));
            }
        
            const data = await response.json();
            // Construction Admin API may return results in different formats
            const users = data.results || data.data || data.users || data;
            
            if (!users || (Array.isArray(users) && users.length === 0)) {
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({
                            message: "No users found",
                            accountId: accountIdClean,
                            count: 0,
                            users: []
                        })
                    }]
                };
            }
            
            return {
                content: Array.isArray(users) ? users.map((user: any) => ({
                    type: "text" as const,
                    text: JSON.stringify({
                        id: user.id,
                        email: user.email,
                        name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
                        ...user
                    })
                })) : [{
                    type: "text" as const,
                    text: JSON.stringify(users)
                }]
            };
        } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            const errorDetails = {
                error: "Failed to get account users",
                message: errorMessage,
                accountId: accountId?.replace(/^b\./, "") || "unknown",
                ...(error?.response?.status && { statusCode: error.response.status }),
                ...(error?.response?.data && { apiError: error.response.data })
            };
            
            throw new Error(JSON.stringify(errorDetails));
        }
    }
};

