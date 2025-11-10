import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { getAccessToken, resolveProjectId } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)")
};

export const getIssueTypes: Tool<typeof schema> = {
    title: "get-issue-types",
    description: "List all issue types in an Autodesk Construction Cloud project. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId }) => {
        try {
            const accessToken = await getAccessToken(["data:read"]);
            const issuesClient = new IssuesClient();
            
            // Resolver projectId (GUID ou nome) para GUID válido
            const cleanedProjectId = await resolveProjectId(projectId, accountId, accessToken);
            
            const issueTypes = await issuesClient.getIssuesTypes(cleanedProjectId, { accessToken });
            if (!issueTypes.results) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            message: "No issue types found",
                            projectId: cleanedProjectId,
                            count: 0,
                            issueTypes: []
                        })
                    }]
                };
            }
            return {
                content: issueTypes.results.map((issue) => ({ type: "text", text: JSON.stringify(issue) }))
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to get issue types",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId || "unknown",
                accountId: accountId || "not provided",
            }));
        }
    }
};