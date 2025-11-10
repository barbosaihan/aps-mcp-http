import { z } from "zod";
import { IssuesClient } from "@aps_sdk/construction-issues";
import { getAccessToken, resolveProjectId, buildApiUrl, fetchWithTimeout } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty().describe("Project ID (GUID) or project name. If a name is provided, the tool will search for the project and use its GUID."),
    accountId: z.string().nonempty().optional().describe("Account ID (required if projectId is a project name instead of a GUID)"),
    categoryId: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

/**
 * Busca causas raiz detalhadas, incluindo subcausas dentro de categorias.
 * Se categoryId for fornecido, retorna apenas as causas raiz dessa categoria.
 */
export const getIssueRootCausesDetailed: Tool<typeof schema> = {
    title: "get-issue-root-causes-detailed",
    description: "Retrieves detailed root causes including subcauses within categories. If categoryId is provided, returns only root causes for that category. Accepts either a project GUID or project name. If a name is provided, accountId is required.",
    schema,
    callback: async ({ projectId, accountId, categoryId }: SchemaType) => {
        try {
            const accessToken = await getAccessToken(["data:read"]);
            const issuesClient = new IssuesClient();
            
            // Resolver projectId (GUID ou nome) para GUID válido
            const projectIdClean = await resolveProjectId(projectId, accountId, accessToken);
            
            // Se categoryId foi fornecido, tentar buscar causas raiz específicas dessa categoria
            if (categoryId) {
                try {
                    // Tentar buscar causas raiz diretamente usando o endpoint de issues com filtro
                    // O Issues API pode ter um endpoint diferente para causas raiz específicas
                    const url = buildApiUrl(`construction/issues/v1/projects/${projectIdClean}/root-causes?categoryId=${categoryId}`);
                    const response = await fetchWithTimeout(url, {
                        headers: {
                            "Authorization": `Bearer ${accessToken}`,
                            "Accept": "application/json"
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json() as any;
                        if (data.results || data.data || Array.isArray(data)) {
                            const causes = data.results || data.data || data;
                            return {
                                content: Array.isArray(causes) ? causes.map((cause: any) => ({
                                    type: "text",
                                    text: JSON.stringify(cause)
                                })) : [{
                                    type: "text",
                                    text: JSON.stringify(data)
                                }]
                            };
                        }
                    }
                } catch (e) {
                    // Se falhar, continuar com método padrão
                }
            }
            
            // Método padrão: buscar categorias
            const rootCauses = await issuesClient.getRootCauseCategories(projectIdClean, { accessToken });
            if (!rootCauses.results) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            message: "No root causes found",
                            projectId: projectIdClean,
                            count: 0,
                            rootCauses: []
                        })
                    }]
                };
            }
            
            // Se categoryId foi fornecido, filtrar apenas essa categoria
            let filteredResults = rootCauses.results;
            if (categoryId) {
                filteredResults = rootCauses.results.filter((rc: any) => 
                    rc.id === categoryId || rc.id === categoryId.replace("b.", "") || 
                    (categoryId.replace("b.", "") === rc.id.replace("b.", ""))
                );
            }
            
            return {
                content: filteredResults.map((rootCause) => ({ 
                    type: "text", 
                    text: JSON.stringify(rootCause) 
                }))
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to get root causes detailed",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId || "unknown",
                accountId: accountId || "not provided",
            }));
        }
    }
};

