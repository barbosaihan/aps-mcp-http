import { z } from "zod";
import { getAccessToken, type Session } from "./common.js";
import type { Tool } from "./common.js";
import { DataManagementClient } from "@aps_sdk/data-management";

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
    callback: async ({ accountId, companyId, roleId, status }: SchemaType, context?: { session?: Session }) => {
        try {
            // Try with OAuth token from session (requires account:read)
            let accessToken = await getAccessToken(["account:read"], context?.session);

            // Remove "b." prefix from accountId if present
            const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;

            if (!accountIdClean || accountIdClean.trim() === "") {
                throw new Error("accountId is required and cannot be empty");
            }

            // Try HQ API endpoint first (same pattern as admin-create-company: /hq/v1/accounts/{accountId}/users)
            let url = `https://developer.api.autodesk.com/hq/v1/accounts/${accountIdClean}/users`;

            const params = new URLSearchParams();
            if (companyId) params.append("companyId", companyId);
            if (roleId) params.append("roleId", roleId);
            if (status) params.append("status", status);

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            let response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            });

            // If HQ API works, use it
            if (response.ok) {
                const data = await response.json();
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
            }

            // Try ACC API endpoint as second option (as per documentation: GET /acc/v1/users)
            // If HQ API failed, try ACC API and then fallback
            if (!response.ok) {
                const hqErrorText = await response.text();
                let hqErrorMessage = `HQ API returned HTTP ${response.status}`;

                try {
                    const hqErrorJson = JSON.parse(hqErrorText);
                    hqErrorMessage = hqErrorJson.developerMessage || hqErrorJson.message || hqErrorMessage;
                } catch {
                    hqErrorMessage = hqErrorText || hqErrorMessage;
                }

                // Only try ACC API if HQ returned 404
                if (response.status === 404) {
                    url = `https://developer.api.autodesk.com/acc/v1/users`;
                    const accParams = new URLSearchParams();
                    accParams.append("accountId", accountIdClean);
                    if (companyId) accParams.append("companyId", companyId);
                    if (roleId) accParams.append("roleId", roleId);
                    if (status) accParams.append("status", status);

                    url += `?${accParams.toString()}`;

                    response = await fetch(url, {
                        headers: {
                            "Authorization": `Bearer ${accessToken}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
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
                    }
                }

                // If both endpoints failed, try fallback with service account token
                // Fallback requires data:read permission
                try {
                    // Fallback: Get users from all projects in the account (requires data:read permission)
                    // Use service account token for fallback as it may have different permissions
                    const fallbackToken = await getAccessToken(["account:read", "data:read"], context?.session);
                    const dataManagementClient = new DataManagementClient();
                    // getHubProjects expects accountId with "b." prefix
                    const accountIdWithPrefix = accountId.startsWith("b.") ? accountId : `b.${accountId}`;
                    const projects = await dataManagementClient.getHubProjects(accountIdWithPrefix, { accessToken: fallbackToken });

                    if (!projects.data || projects.data.length === 0) {
                        const errorText = await response.text();
                        let errorMessage = `Could not retrieve users. HQ API: ${hqErrorMessage}`;

                        try {
                            const errorJson = JSON.parse(errorText);
                            const accError = errorJson.developerMessage || errorJson.message || errorText;
                            errorMessage += `. ACC API: ${accError}`;
                        } catch {
                            errorMessage += `. ACC API returned HTTP ${response.status}`;
                        }

                        throw new Error(JSON.stringify({
                            error: "Failed to get account users",
                            message: `${errorMessage}. Also, no projects found in account to aggregate users from.`,
                            accountId: accountIdClean,
                            statusCode: response.status,
                            attemptedEndpoints: [
                                `hq/v1/accounts/${accountIdClean}/users`,
                                `acc/v1/users?accountId=${accountIdClean}`
                            ]
                        }));
                    }

                    const allUsers = new Map<string, any>();

                    // Helper for delay
                    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

                    // Filter for active projects only
                    const activeProjects = projects.data.filter((p: any) => {
                        const isActive = p.status === 'active' || p.status === 'active_project' || !p.status;
                        return isActive;
                    });

                    // Get users from each project
                    for (const project of activeProjects) {
                        // Add delay to avoid rate limiting
                        await delay(200);

                        const projectId = project.id?.replace("b.", "") || project.id;
                        try {
                            const usersUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users`;
                            const usersResponse = await fetch(usersUrl, {
                                headers: {
                                    "Authorization": `Bearer ${fallbackToken}`
                                }
                            });

                            if (usersResponse.ok) {
                                const usersData = await usersResponse.json();
                                const users = usersData.results || usersData.data || usersData.users || (Array.isArray(usersData) ? usersData : []);

                                if (Array.isArray(users) && users.length > 0) {
                                    for (const user of users) {
                                        const userId = user.id || user.email || user.userId;
                                        if (userId && !allUsers.has(userId)) {
                                            // Apply filters if provided
                                            if (companyId && user.companyId !== companyId) continue;
                                            if (roleId && user.roleId !== roleId) continue;
                                            if (status && user.status !== status) continue;

                                            allUsers.set(userId, {
                                                id: user.id || user.userId,
                                                email: user.email || user.emailAddress,
                                                name: user.name || user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "N/A",
                                                ...user
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

                    const users = Array.from(allUsers.values());

                    return {
                        content: users.map((user: any) => ({
                            type: "text" as const,
                            text: JSON.stringify({
                                id: user.id,
                                email: user.email,
                                name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
                                ...user
                            })
                        }))
                    };
                } catch (fallbackError: any) {
                    // If fallback also fails, return error with details from both attempts
                    const errorText = await response.text();
                    let errorMessage = `Could not retrieve users. HQ API: ${hqErrorMessage}`;

                    try {
                        const errorJson = JSON.parse(errorText);
                        const accError = errorJson.developerMessage || errorJson.message || errorText;
                        errorMessage += `. ACC API: ${accError}`;
                    } catch {
                        errorMessage += `. ACC API returned HTTP ${response.status}`;
                    }

                    const fallbackErrorMsg = fallbackError?.message || fallbackError?.toString() || "Unknown error";
                    if (fallbackErrorMsg.includes("AUTH-010") || fallbackErrorMsg.includes("privilege")) {
                        errorMessage += `. Fallback failed: Token does not have required permissions (data:read) for fallback method.`;
                    } else {
                        errorMessage += `. Fallback failed: ${fallbackErrorMsg}`;
                    }

                    throw new Error(JSON.stringify({
                        error: "Failed to get account users",
                        message: errorMessage,
                        accountId: accountIdClean,
                        statusCode: response.status,
                        attemptedEndpoints: [
                            `hq/v1/accounts/${accountIdClean}/users`,
                            `acc/v1/users?accountId=${accountIdClean}`
                        ],
                        fallbackAttempted: true
                    }));
                }

                // If we reach here, both endpoints failed and fallback was attempted but failed
                // This should not happen as fallback should always throw, but TypeScript needs this
                throw new Error(JSON.stringify({
                    error: "Failed to get account users",
                    message: "All endpoints failed and fallback was unsuccessful",
                    accountId: accountIdClean
                }));
            } else {
                // This should never happen as response.ok was already checked above
                throw new Error(JSON.stringify({
                    error: "Failed to get account users",
                    message: "Unexpected state: response.ok is true but no return was made",
                    accountId: accountIdClean
                }));
            }
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

