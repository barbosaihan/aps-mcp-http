import { z } from "zod";
import { getAccessToken, cleanAccountId, buildApiUrl, fetchWithTimeout, handleApiError, type Session } from "./common.js";
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
    callback: async ({ accountId, email, companyId, firstName, lastName, phone, jobTitle, roleIds }: SchemaType, context?: { session?: Session }) => {
        try {
            const accessToken = await getAccessToken(["account:write"], context?.session);
            const accountIdClean = cleanAccountId(accountId);

            if (!accountIdClean || accountIdClean.trim() === "") {
                throw new Error("accountId is required and cannot be empty");
            }

            // Try the Admin API endpoint with accountId in the path first
            let url = buildApiUrl(`admin/v1/accounts/${accountIdClean}/users`);

            const userData: any = {
                email
            };

            if (companyId) userData.companyId = companyId;
            if (firstName) userData.firstName = firstName;
            if (lastName) userData.lastName = lastName;
            if (phone) userData.phone = phone;
            if (jobTitle) userData.jobTitle = jobTitle;
            if (roleIds) userData.roleIds = roleIds;

            let response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            }, 30000, 0); // Sem retry para POST

            // If path-based endpoint fails, try without accountId in path (legacy endpoint)
            if (!response.ok && response.status === 404) {
                url = buildApiUrl(`admin/v1/users`);
                // Add accountId to body if not already there
                if (!userData.accountId) {
                    userData.accountId = accountIdClean;
                }

                response = await fetchWithTimeout(url, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(userData)
                }, 30000, 0); // Sem retry para POST
            }

            if (!response.ok) {
                throw await handleApiError(response, { operation: "create account user", accountId: accountIdClean, email, url });
            }

            const user = await response.json() as any;
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
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to create account user",
                message: error?.message || error?.toString() || "Unknown error",
                accountId: accountId?.replace(/^b\./, "") || "unknown",
                email: email || "unknown"
            }));
        }
    }
};

