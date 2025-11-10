import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { DataManagementClient } from "@aps_sdk/data-management";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().nonempty(),
    status: z.string().optional().describe("Filter issues by status (e.g., 'open', 'closed', 'pending')"),
    limit: z.number().optional().describe("Maximum number of issues to return per project (default: 100)")
};

export const getAllIssues: Tool<typeof schema> = {
    title: "get-all-issues",
    description: "Get issues from all projects in an Autodesk Construction Cloud account. This is more efficient than calling get-issues for each project individually as it processes projects in parallel.",
    schema,
    callback: async ({ accountId, status, limit = 100 }) => {
        try {
            const accessToken = await getAccessToken(["data:read"]);
            const dataManagementClient = new DataManagementClient();
            const issuesClient = new IssuesClient();

            // Step 1: Get all projects
            const projects = await dataManagementClient.getHubProjects(accountId, { accessToken });
            if (!projects.data || projects.data.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            message: "No projects found", 
                            accountId, 
                            count: 0,
                            issues: []
                        }) 
                    }]
                };
            }

            // Step 2: Fetch issues from all projects in parallel
            const projectIssuesPromises = projects.data.map(async (project) => {
                try {
                    const projectId = project.id?.replace(/^b\./, "") || project.id;
                    if (!projectId) {
                        return { projectId: project.id, projectName: project.attributes?.name, issues: [], error: "Invalid project ID" };
                    }

                    const issues = await issuesClient.getIssues(projectId, { accessToken });
                    
                    // Handle different response formats - same logic as get-issues.ts
                    let results = null;
                    if (issues?.results && Array.isArray(issues.results)) {
                        results = issues.results;
                    } else if (Array.isArray(issues)) {
                        results = issues;
                    }

                    // Filter by status if provided
                    if (status && results) {
                        results = results.filter((issue: any) => {
                            const issueStatus = issue.status?.toLowerCase() || issue.attributes?.status?.toLowerCase();
                            return issueStatus === status.toLowerCase();
                        });
                    }

                    // Apply limit per project
                    if (results && limit > 0) {
                        results = results.slice(0, limit);
                    }

                    // Add project info to each issue
                    const issuesWithProject = (results || []).map((issue: any) => ({
                        ...issue,
                        _projectId: projectId,
                        _projectName: project.attributes?.name || project.id
                    }));

                    return {
                        projectId,
                        projectName: project.attributes?.name || project.id,
                        issues: issuesWithProject,
                        count: issuesWithProject.length
                    };
                } catch (error: any) {
                    // Continue processing other projects even if one fails
                    const errorMessage = error?.message || error?.toString() || "Unknown error";
                    return {
                        projectId: project.id,
                        projectName: project.attributes?.name || project.id,
                        issues: [],
                        count: 0,
                        error: errorMessage
                    };
                }
            });

            // Wait for all projects to complete
            const projectIssuesResults = await Promise.all(projectIssuesPromises);

            // Step 3: Consolidate results
            const allIssues: any[] = [];
            const summary = {
                accountId,
                totalProjects: projects.data.length,
                projectsWithIssues: 0,
                projectsWithErrors: 0,
                totalIssues: 0,
                projects: [] as any[]
            };

            projectIssuesResults.forEach((result) => {
                const count = result.count || 0;
                if (result.error) {
                    summary.projectsWithErrors++;
                } else if (count > 0) {
                    summary.projectsWithIssues++;
                }
                
                summary.totalIssues += count;
                allIssues.push(...result.issues);
                
                summary.projects.push({
                    projectId: result.projectId,
                    projectName: result.projectName,
                    issueCount: result.count,
                    hasError: !!result.error,
                    error: result.error || undefined
                });
            });

            // Return consolidated results
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            summary,
                            issues: allIssues,
                            totalIssues: allIssues.length
                        })
                    }
                ]
            };
        } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || "Unknown error";
            const errorDetails = {
                error: "Failed to get all issues",
                message: errorMessage,
                accountId: accountId || "unknown",
                ...(error?.response?.status && { statusCode: error.response.status }),
                ...(error?.response?.data && { apiError: error.response.data })
            };

            throw new Error(JSON.stringify(errorDetails));
        }
    }
};

