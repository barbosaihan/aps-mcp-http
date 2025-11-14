import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { getAccessToken, resolveProjectId } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)"),
    issueId: z.string().nonempty()
};

export const getIssueComments: Tool<typeof schema> = {
    title: "get-issue-comments",
    description: "Retrieves a list of comments associated with an issue in Autodesk Construction Cloud. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId, issueId }) => {
        try {
            const accessToken = await getAccessToken(["data:read"]);
            const issuesClient = new IssuesClient();
            
            // Resolver projectId (GUID ou nome) para GUID válido
            const cleanedProjectId = await resolveProjectId(projectId, accountId, accessToken);
            
            const comments = await issuesClient.getComments(cleanedProjectId, issueId, { accessToken });
            if (!comments.results) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            message: "No comments found",
                            projectId: cleanedProjectId,
                            issueId,
                            count: 0,
                            comments: []
                        })
                    }]
                };
            }
            return {
                content: comments.results.map((comment) => ({ type: "text", text: JSON.stringify(comment) }))
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to get issue comments",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId || "unknown",
                accountId: accountId || "not provided",
                issueId: issueId || "unknown",
            }));
        }
    }
};