import { z } from "zod";
import { getAccessToken, resolveProjectId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)"),
    title: z.string().nonempty(),
    issueSubtypeId: z.string().nonempty(),
    status: z.enum(["draft", "open", "pending", "in_progress", "completed", "in_review", "not_approved", "in_dispute", "closed"]),
    description: z.string().optional(),
    assignedTo: z.string().optional(),
    assignedToType: z.enum(["user", "company", "role"]).optional(),
    dueDate: z.string().optional(),
    startDate: z.string().optional(),
    locationId: z.string().optional(),
    locationDetails: z.string().optional(),
    rootCauseId: z.string().optional(),
    published: z.boolean().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const createIssue: Tool<typeof schema> = {
    title: "create-issue",
    description: "Adds an issue to a project in Autodesk Construction Cloud. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId, title, issueSubtypeId, status, description, assignedTo, assignedToType, dueDate, startDate, locationId, locationDetails, rootCauseId, published }: SchemaType) => {
        try {
            const accessToken = await getAccessToken(["data:write"]);
            
            // Resolver projectId (GUID ou nome) para GUID válido
            const projectIdClean = await resolveProjectId(projectId, accountId, accessToken);
            
            const url = buildApiUrl(`construction/issues/v1/projects/${projectIdClean}/issues`);
            
            const issueData: any = {
                title,
                issueSubtypeId,
                status
            };
            
            if (description) issueData.description = description;
            if (assignedTo) issueData.assignedTo = assignedTo;
            if (assignedToType) issueData.assignedToType = assignedToType;
            if (dueDate) issueData.dueDate = dueDate;
            if (startDate) issueData.startDate = startDate;
            if (locationId) issueData.locationId = locationId;
            if (locationDetails) issueData.locationDetails = locationDetails;
            if (rootCauseId) issueData.rootCauseId = rootCauseId;
            if (published !== undefined) issueData.published = published;
            
            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(issueData)
            }, 30000, 0); // Sem retry para POST
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "create issue", projectId: projectIdClean });
            }
            
            const issue = await response.json() as any;
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({ id: issue.id, title: issue.title, status: issue.status, displayId: issue.displayId })
                }]
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to create issue",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId?.replace(/^b\./, "") || "unknown"
            }));
        }
    }
};
