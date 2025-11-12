import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { DataManagementClient } from "@aps_sdk/data-management";
import { getAccessToken, getCachedClientCredentialsAccessToken, extractProjectGuid, cleanProjectId, isValidGuid } from "./common.js";
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
            const accountReadToken = await getCachedClientCredentialsAccessToken(["account:read"]);
            const dataManagementClient = new DataManagementClient();
            const issuesClient = new IssuesClient();

            // Step 0: Get all users to map IDs to names
            // Create multiple maps for different ID formats (id, uid, email, project-specific IDs)
            const userMapById = new Map<string, string>();
            const userMapByUid = new Map<string, string>();
            const userMapByEmail = new Map<string, string>();
            const userMapByProjectId = new Map<string, Map<string, string>>(); // projectId -> (userId -> userName)
            const roleMapByProjectId = new Map<string, Map<string, string>>(); // projectId -> (roleGroupId/roleId -> roleName)
            const companyMapByProjectId = new Map<string, Map<string, string>>(); // projectId -> (companyId -> companyName)
            
            try {
                const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
                const usersUrl = `https://developer.api.autodesk.com/hq/v1/accounts/${accountIdClean}/users`;
                const usersResponse = await fetch(usersUrl, {
                    headers: {
                        "Authorization": `Bearer ${accountReadToken}`
                    }
                });
                
                if (usersResponse.ok) {
                    const usersData = await usersResponse.json();
                    const users = usersData.results || usersData.data || usersData.users || (Array.isArray(usersData) ? usersData : []);
                    
                    if (Array.isArray(users)) {
                        for (const user of users) {
                            const userId = user.id || user.userId;
                            const userUid = user.uid;
                            const userEmail = user.email;
                            const userName = user.name || user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || userEmail || "Unknown";
                            
                            // Map by ID (GUID)
                            if (userId) {
                                userMapById.set(userId, userName);
                            }
                            
                            // Map by UID (alphanumeric like "3NB2QWPLPJNR55VY")
                            if (userUid) {
                                userMapByUid.set(String(userUid), userName);
                            }
                            
                            // Map by email (as fallback)
                            if (userEmail) {
                                userMapByEmail.set(userEmail, userName);
                            }
                        }
                    }
                }
            } catch (error) {
                // Se falhar ao buscar usuários da conta, continua sem o mapeamento
                console.warn("Failed to fetch account users for name mapping:", error);
            }

            // Step 1: Get all projects
            // getHubProjects expects accountId with "b." prefix
            const accountIdWithPrefix = accountId.startsWith("b.") ? accountId : `b.${accountId}`;
            const projects = await dataManagementClient.getHubProjects(accountIdWithPrefix, { accessToken });
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

                    // Get project users, roles, and companies for this specific project
                    try {
                        // Get project users (requires account:read permission)
                        const projectUsersUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users`;
                        const projectUsersResponse = await fetch(projectUsersUrl, {
                            headers: {
                                "Authorization": `Bearer ${accountReadToken}`
                            }
                        });
                        
                        if (projectUsersResponse.ok) {
                            const projectUsersData = await projectUsersResponse.json();
                            const projectUsers = projectUsersData.results || projectUsersData.data || projectUsersData.users || (Array.isArray(projectUsersData) ? projectUsersData : []);
                            
                            if (Array.isArray(projectUsers)) {
                                const projectUserMap = new Map<string, string>();
                                const projectRoleMap = new Map<string, string>();
                                
                                for (const user of projectUsers) {
                                    // Map user IDs
                                    const possibleIds = [
                                        user.id,
                                        user.userId,
                                        user.uid,
                                        user.autodeskId,
                                        String(user.id),
                                        String(user.userId)
                                    ].filter(Boolean);
                                    
                                    const userName = user.name || user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown";
                                    
                                    for (const id of possibleIds) {
                                        if (id) {
                                            projectUserMap.set(String(id), userName);
                                        }
                                    }
                                    
                                    // Map roles from user (roleGroupId and roleId)
                                    if (user.roles && Array.isArray(user.roles)) {
                                        for (const role of user.roles) {
                                            if (role.roleGroupId) {
                                                projectRoleMap.set(String(role.roleGroupId), role.name || role.roleName || "Unknown Role");
                                            }
                                            if (role.id) {
                                                projectRoleMap.set(String(role.id), role.name || role.roleName || "Unknown Role");
                                            }
                                        }
                                    }
                                }
                                
                                if (projectUserMap.size > 0) {
                                    userMapByProjectId.set(projectId, projectUserMap);
                                }
                                if (projectRoleMap.size > 0) {
                                    roleMapByProjectId.set(projectId, projectRoleMap);
                                }
                            }
                        }
                        
                        // Get project companies (requires account:read permission)
                        const projectCompaniesUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/companies`;
                        const projectCompaniesResponse = await fetch(projectCompaniesUrl, {
                            headers: {
                                "Authorization": `Bearer ${accountReadToken}`
                            }
                        });
                        
                        if (projectCompaniesResponse.ok) {
                            const projectCompaniesData = await projectCompaniesResponse.json();
                            const projectCompanies = projectCompaniesData.results || projectCompaniesData.data || projectCompaniesData.companies || (Array.isArray(projectCompaniesData) ? projectCompaniesData : []);
                            
                            if (Array.isArray(projectCompanies)) {
                                const projectCompanyMap = new Map<string, string>();
                                for (const company of projectCompanies) {
                                    const companyId = company.id || company.companyId;
                                    const companyName = company.name || company.companyName || "Unknown Company";
                                    if (companyId) {
                                        projectCompanyMap.set(String(companyId), companyName);
                                    }
                                }
                                
                                if (projectCompanyMap.size > 0) {
                                    companyMapByProjectId.set(projectId, projectCompanyMap);
                                }
                            }
                        }
                    } catch (error) {
                        // Continue if project data fetch fails
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

                    // Add project info to each issue and resolve assignedTo to user name
                    const issuesWithProject = (results || []).map((issue: any) => {
                        const issueCopy = JSON.parse(JSON.stringify(issue)); // Deep copy
                        
                        // Helper function to resolve assignedTo to name based on type
                        const resolveAssignedToName = (assignedTo: any, assignedToType: string | undefined): string | null => {
                            if (!assignedTo) return null;
                            
                            let searchId: string | null = null;
                            
                            // If assignedTo is a string, use it directly
                            if (typeof assignedTo === 'string') {
                                searchId = assignedTo;
                            }
                            // If assignedTo is an object, try to extract ID
                            else if (typeof assignedTo === 'object') {
                                searchId = assignedTo.id || assignedTo.uid || assignedTo.email || null;
                            }
                            
                            if (!searchId) return null;
                            
                            // Determine type from assignedToType or try to infer
                            const type = (assignedToType || issueCopy.assignedToType || 'user').toLowerCase();
                            
                            // If type is "role", try role maps
                            if (type === 'role') {
                                const projectRoleMap = roleMapByProjectId.get(projectId);
                                if (projectRoleMap && projectRoleMap.has(searchId)) {
                                    return projectRoleMap.get(searchId)!;
                                }
                            }
                            
                            // If type is "company", try company maps
                            if (type === 'company') {
                                const projectCompanyMap = companyMapByProjectId.get(projectId);
                                if (projectCompanyMap && projectCompanyMap.has(searchId)) {
                                    return projectCompanyMap.get(searchId)!;
                                }
                            }
                            
                            // If type is "user" or unknown, try user maps
                            // First, try project-specific user map (for project-specific IDs)
                            const projectUserMap = userMapByProjectId.get(projectId);
                            if (projectUserMap && projectUserMap.has(searchId)) {
                                return projectUserMap.get(searchId)!;
                            }
                            
                            // Try lookup by GUID (id)
                            if (userMapById.has(searchId)) {
                                return userMapById.get(searchId)!;
                            }
                            
                            // Try lookup by UID (alphanumeric)
                            if (userMapByUid.has(searchId)) {
                                return userMapByUid.get(searchId)!;
                            }
                            
                            // Try lookup by email
                            if (userMapByEmail.has(searchId)) {
                                return userMapByEmail.get(searchId)!;
                            }
                            
                            // If still not found and no type specified, try role as fallback (for IDs like "622000276")
                            if (!assignedToType) {
                                const projectRoleMap = roleMapByProjectId.get(projectId);
                                if (projectRoleMap && projectRoleMap.has(searchId)) {
                                    return projectRoleMap.get(searchId)!;
                                }
                            }
                            
                            return null;
                        };
                        
                        // Check multiple possible locations for assignedTo
                        const assignedTo = issueCopy.assignedTo || issueCopy.attributes?.assignedTo || issueCopy.relationships?.assignedTo?.data?.id || issueCopy.assignedToId;
                        const assignedToType = issueCopy.assignedToType || issueCopy.attributes?.assignedToType;
                        
                        // Resolve assignedTo to name based on type (user, role, or company)
                        const resolvedName = resolveAssignedToName(assignedTo, assignedToType);
                        
                        // If we found a name, add it to the issue
                        if (resolvedName) {
                            // Add assignedToName field
                            issueCopy.assignedToName = resolvedName;
                            
                            // Also add to attributes if it exists
                            if (issueCopy.attributes) {
                                issueCopy.attributes.assignedToName = resolvedName;
                            } else if (assignedTo) {
                                issueCopy.attributes = { ...issueCopy.attributes, assignedToName: resolvedName };
                            }
                        }
                        
                        // Add issue URL for direct access
                        const issueId = issueCopy.id || issueCopy.displayId || issueCopy.issueId;
                        if (issueId && projectId) {
                            issueCopy.issueUrl = `https://acc.autodesk.com/projects/${projectId}/issues/${issueId}`;
                            // Also add to attributes if it exists
                            if (issueCopy.attributes) {
                                issueCopy.attributes.issueUrl = issueCopy.issueUrl;
                            }
                        }
                        
                        return {
                            ...issueCopy,
                            _projectId: projectId,
                            _projectName: projectName
                        };
                    });

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

