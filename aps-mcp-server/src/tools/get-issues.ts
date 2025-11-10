import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty()
};

export const getIssues: Tool<typeof schema> = {
    title: "get-issues",
    description: "List issues in projects in an Autodesk Construction Cloud account",
    schema,
    callback: async ({ projectId }) => {
        try {
            // TODO: add pagination support
            const accessToken = await getAccessToken(["data:read"]);
            const issuesClient = new IssuesClient();
            
            // Clean projectId - remove "b." prefix if present
            const cleanProjectId = projectId.replace(/^b\./, "");
            
            if (!cleanProjectId || cleanProjectId.trim() === "") {
                throw new Error("Invalid projectId: projectId cannot be empty");
            }
            
            const issues = await issuesClient.getIssues(cleanProjectId, { accessToken });
            
            // Handle different response formats
            let results = null;
            if (issues?.results && Array.isArray(issues.results)) {
                results = issues.results;
            } else if (Array.isArray(issues)) {
                results = issues;
            } else if (issues?.data && Array.isArray(issues.data)) {
                results = issues.data;
            }
            
            // Return empty array if no issues found (instead of throwing error)
            if (!results || results.length === 0) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ message: "No issues found", projectId: cleanProjectId, count: 0 }) }]
                };
            }
            
            return {
                content: results.map((issue) => ({ type: "text", text: JSON.stringify(issue) }))
            };
        } catch (error: any) {
            // Provide more detailed error messages
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            const errorDetails = {
                error: "Failed to get issues",
                message: errorMessage,
                projectId: projectId?.replace(/^b\./, "") || "unknown",
                ...(error?.response?.status && { statusCode: error.response.status }),
                ...(error?.response?.data && { apiError: error.response.data })
            };
            
            throw new Error(JSON.stringify(errorDetails));
        }
    }
};