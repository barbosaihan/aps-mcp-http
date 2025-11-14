import { z } from "zod";
import { getAccessToken, resolveProjectId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const getIssueSubtypes: Tool<typeof schema> = {
    title: "get-issue-subtypes",
    description: "Retrieves all issue types with their subtypes in an Autodesk Construction Cloud project. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId }: SchemaType) => {
        try {
            const accessToken = await getAccessToken(["data:read"]);
            
            // Resolver projectId (GUID ou nome) para GUID válido
            const cleanProjectId = await resolveProjectId(projectId, accountId, accessToken);
            
            const url = buildApiUrl(`construction/issues/v1/projects/${cleanProjectId}/issue-types?include=subtypes`);
            
            const response = await fetchWithTimeout(url, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Accept": "application/json"
                }
            });
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "get issue subtypes", projectId: cleanProjectId });
            }
            
            const data = await response.json() as any;
            
            // Extract subtypes from the response
            const subtypes: any[] = [];
            if (data.results) {
                for (const issueType of data.results) {
                    if (issueType.subtypes && issueType.subtypes.length > 0) {
                        for (const subtype of issueType.subtypes) {
                            subtypes.push({
                                id: subtype.id,
                                title: subtype.title,
                                issueTypeId: issueType.id,
                                issueTypeTitle: issueType.title
                            });
                        }
                    }
                }
            }
            
            return {
                content: subtypes.map((subtype) => ({ 
                    type: "text", 
                    text: JSON.stringify(subtype) 
                }))
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to get issue subtypes",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId || "unknown",
                accountId: accountId || "not provided",
            }));
        }
    }
};

