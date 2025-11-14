import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { getAccessToken, resolveProjectId, type Session } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)")
};

export const getIssues: Tool<typeof schema> = {
    title: "get-issues",
    description: "List all issues in a project. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId }, context?: { session?: Session }) => {
        try {
            const accessToken = await getAccessToken(["data:read"], context?.session);
            const issuesClient = new IssuesClient();
            
            // Resolver projectId (GUID ou nome) para GUID válido
            const cleanedProjectId = await resolveProjectId(projectId, accountId, accessToken);
            
            // Chamar API de issues com GUID válido
            const issues = await issuesClient.getIssues(cleanedProjectId, { accessToken });
            
            // Handle different response formats
            let results = null;
            if (issues?.results && Array.isArray(issues.results)) {
                results = issues.results;
            } else if (Array.isArray(issues)) {
                results = issues;
            }
            
            if (!results || results.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            message: "No issues found",
                            projectId: cleanedProjectId,
                            count: 0,
                            issues: []
                        })
                    }]
                };
            }
            
            return {
                content: results.map((issue) => ({
                    type: "text",
                    text: JSON.stringify(issue)
                }))
            };
        } catch (error: any) {
            // Se o erro já é um Error com JSON, re-throw
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            
            // Construir mensagem de erro detalhada
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            throw new Error(JSON.stringify({
                error: "Failed to get issues",
                message: errorMessage,
                projectId: projectId || "unknown",
                accountId: accountId || "not provided",
            }));
        }
    }
};