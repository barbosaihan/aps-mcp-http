import { z } from "zod";
import { getAccessToken, cleanProjectId, buildApiUrl, fetchWithTimeout, handleApiError, type Session } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    users: z.array(z.object({
        email: z.string().email().optional(),
        userId: z.string().optional(),
        companyId: z.string().optional(),
        roleIds: z.array(z.string()).optional(),
        permissions: z.array(z.string()).optional()
    }))
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminImportProjectUsers: Tool<typeof schema> = {
    title: "admin-import-project-users",
    description: "Import multiple users to a project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ projectId, users }: SchemaType, context?: { session?: Session }) => {
        try {
            const accessToken = await getAccessToken(["account:write"], context?.session);
            const projectIdClean = cleanProjectId(projectId);
            const url = buildApiUrl(`construction/admin/v1/projects/${projectIdClean}/users:import`);

            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ users })
            }, 30000, 0); // Sem retry para POST

            if (!response.ok) {
                throw await handleApiError(response, { operation: "import project users", projectId: projectIdClean, userCount: users.length });
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
                error: "Failed to import project users",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId?.replace(/^b\./, "") || "unknown",
                userCount: users.length
            }));
        }
    }
};

