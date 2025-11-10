import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetProject: Tool<typeof schema> = {
    title: "admin-get-project",
    description: "Get detailed information about a specific project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ projectId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Could not retrieve project: ${await response.text()}`);
        }
        const project = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(project)
            }]
        };
    }
};

