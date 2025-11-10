import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { getAccessToken, resolveProjectId } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)")
};

export const getIssueRootCauses: Tool<typeof schema> = {
    title: "get-issue-root-causes",
    description: "Retrieves a list of supported root cause categories and root causes that you can allocate to an issue in Autodesk Construction Cloud. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId }) => {
        try {
            const accessToken = await getAccessToken(["data:read"]);
            const issuesClient = new IssuesClient();
            
            // Resolver projectId (GUID ou nome) para GUID válido
            const cleanedProjectId = await resolveProjectId(projectId, accountId, accessToken);
            
            const rootCauses = await issuesClient.getRootCauseCategories(cleanedProjectId, { accessToken });
            if (!rootCauses.results) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            message: "No root causes found",
                            projectId: cleanedProjectId,
                            count: 0,
                            rootCauses: []
                        })
                    }]
                };
            }
            return {
                content: rootCauses.results.map((rootCause) => ({ type: "text", text: JSON.stringify(rootCause) }))
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to get root causes",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId || "unknown",
                accountId: accountId || "not provided",
            }));
        }
    }
};