import { z } from "zod";
import { getCachedClientCredentialsAccessToken, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    userId: z.string().min(1, "userId is required"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    jobTitle: z.string().optional(),
    companyId: z.string().optional(),
    roleIds: z.array(z.string()).optional(),
    status: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminUpdateAccountUser: Tool<typeof schema> = {
    title: "admin-update-account-user",
    description: "Update a user's information in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ userId, firstName, lastName, phone, jobTitle, companyId, roleIds, status }: SchemaType) => {
        try {
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const url = buildApiUrl(`admin/v1/users/${userId}`);
            
            const userData: any = {};
            if (firstName) userData.firstName = firstName;
            if (lastName) userData.lastName = lastName;
            if (phone) userData.phone = phone;
            if (jobTitle) userData.jobTitle = jobTitle;
            if (companyId) userData.companyId = companyId;
            if (roleIds) userData.roleIds = roleIds;
            if (status) userData.status = status;
            
            const response = await fetchWithTimeout(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            }, 30000, 0); // Sem retry para PATCH
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "update account user", userId });
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
                error: "Failed to update account user",
                message: error?.message || error?.toString() || "Unknown error",
                userId: userId || "unknown"
            }));
        }
    }
};

