import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { DataManagementClient } from "@aps_sdk/data-management";
import { getAccessToken, extractProjectGuid, cleanProjectId, isValidGuid } from "./common.js";
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
                    const projectName = project.attributes?.name || (project as any).name || "Unknown";
                    
                    // Extrair GUID válido do projeto
                    let projectId = extractProjectGuid(project);
                    
                    // Se não encontrou GUID válido, tentar limpar o ID padrão
                    if (!projectId && project.id) {
                        const cleanedId = cleanProjectId(project.id);
                        // Verificar se após limpar ainda é um GUID válido
                        // IMPORTANTE: NUNCA usar o nome do projeto como ID
                        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        if (guidRegex.test(cleanedId) && cleanedId !== projectName) {
                            projectId = cleanedId;
                        }
                    }
                    
                    // Validação final: garantir que não estamos usando o nome como ID
                    if (!projectId || projectId === projectName || !isValidGuid(projectId)) {
                        // Construir mensagem de erro detalhada para debugging
                        const projectDebugInfo = {
                            id: project.id,
                            attributes: project.attributes,
                            relationships: project.relationships,
                            name: projectName
                        };
                        return { 
                            projectId: null, 
                            projectName, 
                            issues: [], 
                            error: `Invalid project ID: project "${projectName}" does not have a valid GUID. Received project.id="${project.id}". This may indicate the SDK returned unexpected data format. Project data: ${JSON.stringify(projectDebugInfo)}` 
                        };
                    }

                    // Validação adicional: garantir que projectId não é o nome
                    if (projectId.toLowerCase() === projectName.toLowerCase()) {
                        return {
                            projectId: null,
                            projectName,
                            issues: [],
                            error: `Security check failed: projectId matches project name "${projectName}". This should never happen.`
                        };
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
                        _projectName: projectName
                    }));

                    return {
                        projectId,
                        projectName,
                        issues: issuesWithProject,
                        count: issuesWithProject.length
                    };
                } catch (error: any) {
                    // Continue processing other projects even if one fails
                    const projectName = project.attributes?.name || (project as any).name || "Unknown";
                    const projectId = extractProjectGuid(project) || project.id || "Unknown";
                    const errorMessage = error?.message || error?.toString() || "Unknown error";
                    
                    // Incluir detalhes do erro para debugging
                    let detailedError = errorMessage;
                    if (error?.response?.data || error?.response?.status) {
                        try {
                            const errorData = error.response.data || {};
                            detailedError = JSON.stringify({
                                message: errorMessage,
                                status: error.response.status,
                                errorData,
                                projectId,
                                projectName
                            });
                        } catch {
                            detailedError = errorMessage;
                        }
                    }
                    
                    return {
                        projectId,
                        projectName,
                        issues: [],
                        count: 0,
                        error: detailedError
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

