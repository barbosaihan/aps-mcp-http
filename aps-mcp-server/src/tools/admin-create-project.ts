import { z } from "zod";
import { getCachedClientCredentialsAccessToken, cleanAccountId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
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
        try {
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const accountIdClean = cleanAccountId(accountId);
            const url = buildApiUrl(`construction/admin/v1/accounts/${accountIdClean}/projects`);
            
            const projectData: any = {
                name,
                type: type || "Commercial"  // Required: Project construction type (e.g., "Office", "Commercial", "Hospital", "Oil & Gas", etc.)
            };
            
            if (serviceTypes) projectData.serviceTypes = serviceTypes;
            if (templateId) projectData.templateId = templateId;
            if (region) projectData.region = region;
            
            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(projectData)
            }, 30000, 0); // Sem retry para POST
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "create project", accountId: accountIdClean });
            }
            
            const project = await response.json() as any;
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
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to create project",
                message: error?.message || error?.toString() || "Unknown error",
                accountId: accountId?.replace(/^b\./, "") || "unknown"
            }));
        }
    }
};

