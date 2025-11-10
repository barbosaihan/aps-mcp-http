import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetAccountProjects: Tool<typeof schema> = {
    title: "admin-get-account-projects",
    description: "List all projects in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ accountId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        
        // Remove "b." prefix from accountId if present
        const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountIdClean}/projects`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Could not retrieve projects: ${await response.text()}`);
        }
        const data = await response.json();
        // Construction Admin API returns projects in results array
        const projects = data.results || data.data || data.projects || data;
        return {
            content: Array.isArray(projects) ? projects.map((project: any) => ({
                type: "text" as const,
                text: JSON.stringify({
                    id: project.id,
                    name: project.name || project.attributes?.name,
                    accountId: project.accountId || accountId,
                    ...project
                })
            })) : [{
                type: "text" as const,
                text: JSON.stringify(projects)
            }]
        };
    }
};

