import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetProjectUsers: Tool<typeof schema> = {
    title: "admin-get-project-users",
    description: "List all users in a specific project using Admin API",
    schema,
    callback: async ({ projectId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/users`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Could not retrieve users: ${await response.text()}`);
        }
        const data = await response.json();
        const users = data.data || data.users || data;
        return {
            content: Array.isArray(users) ? users.map((user: any) => ({
                type: "text" as const,
                text: JSON.stringify({
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    ...user
                })
            })) : [{
                type: "text" as const,
                text: JSON.stringify(users)
            }]
        };
    }
};

