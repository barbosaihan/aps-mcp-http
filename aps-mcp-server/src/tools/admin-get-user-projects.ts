import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    userId: z.string().min(1, "userId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetUserProjects: Tool<typeof schema> = {
    title: "admin-get-user-projects",
    description: "Get all projects for a specific user in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ userId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        const url = `https://developer.api.autodesk.com/admin/v1/users/${userId}/projects`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not retrieve user projects: ${await response.text()}`);
        }
        
        const data = await response.json();
        const projects = data.data || data.projects || data;
        return {
            content: Array.isArray(projects) ? projects.map((project: any) => ({
                type: "text" as const,
                text: JSON.stringify({
                    id: project.id,
                    name: project.name,
                    ...project
                })
            })) : [{
                type: "text" as const,
                text: JSON.stringify(projects)
            }]
        };
    }
};

