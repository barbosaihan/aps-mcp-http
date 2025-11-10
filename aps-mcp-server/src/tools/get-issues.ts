import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { DataManagementClient } from "@aps_sdk/data-management";
import { getAccessToken, extractProjectGuid, cleanProjectId, isValidGuid } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)")
};

export const getIssues: Tool<typeof schema> = {
    title: "get-issues",
    description: "List all issues in a project. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId }) => {
        try {
            const accessToken = await getAccessToken(["data:read"]);
            const issuesClient = new IssuesClient();
            const dataManagementClient = new DataManagementClient();
            
            // Limpar projectId (remover prefixo "b." se presente)
            let cleanedProjectId = cleanProjectId(projectId);
            
            // Verificar se é um GUID válido
            if (!isValidGuid(cleanedProjectId)) {
                // Se não é um GUID válido, pode ser um nome de projeto
                // Nesse caso, precisamos do accountId para buscar o projeto
                if (!accountId) {
                    throw new Error(`Invalid project ID: "${projectId}" is not a valid GUID. Please provide accountId when using project name.`);
                }
                
                // Buscar projeto pelo nome
                const accountIdClean = cleanProjectId(accountId);
                const projects = await dataManagementClient.getHubProjects(accountIdClean, { accessToken });
                
                if (!projects.data || projects.data.length === 0) {
                    throw new Error(`No projects found in account ${accountIdClean}`);
                }
                
                // Procurar projeto pelo nome (case-insensitive)
                const projectName = cleanedProjectId;
                const foundProject = projects.data.find((project) => {
                    const projectNameFromData = project.attributes?.name || (project as any).name || "";
                    return projectNameFromData.toLowerCase() === projectName.toLowerCase();
                });
                
                if (!foundProject) {
                    throw new Error(`Project "${projectName}" not found in account ${accountIdClean}. Available projects: ${projects.data.map(p => p.attributes?.name || p.id).join(", ")}`);
                }
                
                // Extrair GUID do projeto encontrado
                const extractedGuid = extractProjectGuid(foundProject);
                
                if (!extractedGuid || !isValidGuid(extractedGuid)) {
                    throw new Error(`Failed to extract valid GUID from project "${projectName}". Project ID: ${foundProject.id}`);
                }
                
                cleanedProjectId = extractedGuid;
            }
            
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