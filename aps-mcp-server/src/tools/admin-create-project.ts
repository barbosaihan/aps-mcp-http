import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required"),
    name: z.string().min(1, "name is required"),
    type: z.string().optional().default("Commercial"), // Project construction type (e.g., "Office", "Commercial", "Hospital", "Oil & Gas", etc.)
    serviceTypes: z.array(z.string()).optional(),
    templateId: z.string().optional(),
    region: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminCreateProject: Tool<typeof schema> = {
    title: "admin-create-project",
    description: "Create a new project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ accountId, name, type, serviceTypes, templateId, region }: SchemaType) => {
        const accessToken = await getAccessToken(["account:write"]);
        
        // Remove "b." prefix from accountId if present
        const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountIdClean}/projects`;
        
        const projectData: any = {
            name,
            type: type || "Commercial"  // Required: Project construction type (e.g., "Office", "Commercial", "Hospital", "Oil & Gas", etc.)
        };
        
        if (serviceTypes) projectData.serviceTypes = serviceTypes;
        if (templateId) projectData.templateId = templateId;
        if (region) projectData.region = region;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(projectData)
        });
        
        if (!response.ok) {
            throw new Error(`Could not create project: ${await response.text()}`);
        }
        
        const project = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify({
                    id: project.id,
                    name: project.name,
                    accountId: project.accountId,
                    ...project
                })
            }]
        };
    }
};

