import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    userId: z.string().min(1, "userId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetProjectUser: Tool<typeof schema> = {
    title: "admin-get-project-user",
    description: "Get detailed information about a specific user in a project using Admin API",
    schema,
    callback: async ({ projectId, userId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/users/${userId}`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Could not retrieve user: ${await response.text()}`);
        }
        const user = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(user)
            }]
        };
    }
};

