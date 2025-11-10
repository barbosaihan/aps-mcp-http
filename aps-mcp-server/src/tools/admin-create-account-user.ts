import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required"),
    email: z.string().email().min(1, "email is required"),
    companyId: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    jobTitle: z.string().optional(),
    roleIds: z.array(z.string()).optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminCreateAccountUser: Tool<typeof schema> = {
    title: "admin-create-account-user",
    description: "Create a new user in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ accountId, email, companyId, firstName, lastName, phone, jobTitle, roleIds }: SchemaType) => {
        try {
            const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
            
            // Remove "b." prefix from accountId if present
            const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
            
            if (!accountIdClean || accountIdClean.trim() === "") {
                throw new Error("accountId is required and cannot be empty");
            }
            
            // Try the Admin API endpoint with accountId in the path first
            let url = `https://developer.api.autodesk.com/admin/v1/accounts/${accountIdClean}/users`;
            
            const userData: any = {
                email
            };
            
            if (companyId) userData.companyId = companyId;
            if (firstName) userData.firstName = firstName;
            if (lastName) userData.lastName = lastName;
            if (phone) userData.phone = phone;
            if (jobTitle) userData.jobTitle = jobTitle;
            if (roleIds) userData.roleIds = roleIds;
            
            let response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            });
            
            // If path-based endpoint fails, try without accountId in path (legacy endpoint)
            if (!response.ok && response.status === 404) {
                url = `https://developer.api.autodesk.com/admin/v1/users`;
                // Add accountId to body if not already there
                if (!userData.accountId) {
                    userData.accountId = accountIdClean;
                }
                
                response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(userData)
                });
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Could not create user (HTTP ${response.status})`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.developerMessage || errorJson.message || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                
                throw new Error(JSON.stringify({
                    error: "Failed to create account user",
                    message: errorMessage,
                    accountId: accountIdClean,
                    email,
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
                        accountId: accountIdClean,
                        ...user
                    })
                }]
            };
        } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            const errorDetails = {
                error: "Failed to create account user",
                message: errorMessage,
                accountId: accountId?.replace(/^b\./, "") || "unknown",
                email: email || "unknown",
                ...(error?.response?.status && { statusCode: error.response.status }),
                ...(error?.response?.data && { apiError: error.response.data })
            };
            
            throw new Error(JSON.stringify(errorDetails));
        }
    }
};

