import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetProjectCompanies: Tool<typeof schema> = {
    title: "admin-get-project-companies",
    description: "Get all companies in a specific project using Admin API",
    schema,
    callback: async ({ projectId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/companies`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not retrieve project companies: ${await response.text()}`);
        }
        
        const data = await response.json();
        const companies = data.data || data.companies || data;
        return {
            content: Array.isArray(companies) ? companies.map((company: any) => ({
                type: "text" as const,
                text: JSON.stringify({
                    id: company.id,
                    name: company.name,
                    ...company
                })
            })) : [{
                type: "text" as const,
                text: JSON.stringify(companies)
            }]
        };
    }
};

