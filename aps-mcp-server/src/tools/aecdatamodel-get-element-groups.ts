import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    hubId: z.string().min(1, "hubId is required"),
    projectId: z.string().min(1, "projectId is required").optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

/**
 * AEC Data Model API - Get Element Groups
 * 
 * Obtém os ElementGroups disponíveis em um hub/projeto.
 * ElementGroups representam modelos Revit processados pela AEC Data Model API.
 * 
 * Reference: https://aps.autodesk.com/en/docs/aecdatamodel/v1/developers_guide/overview/
 */
export const aecdatamodelGetElementGroups: Tool<typeof schema> = {
    title: "aecdatamodel-get-element-groups",
    description: "Get ElementGroups (processed Revit models) from a hub/project in the AEC Data Model API",
    schema,
    callback: async ({ hubId, projectId }: SchemaType) => {
        const accessToken = await getAccessToken(["data:read"]);
        
        // AEC Data Model API aceita IDs com prefixo "b." diretamente
        // Query GraphQL para obter ElementGroups usando elementGroupsByProject
        const query = projectId 
            ? `
                query GetElementGroupsByProject($projectId: ID!) {
                    elementGroupsByProject(projectId: $projectId) {
                        results {
                            id
                            name
                            alternativeIdentifiers {
                                fileVersionUrn
                            }
                        }
                    }
                }
            `
            : `
                query GetProjects($hubId: ID!) {
                    projects(hubId: $hubId) {
                        results {
                            id
                            name
                            elementGroups {
                                results {
                                    id
                                    name
                                    alternativeIdentifiers {
                                        fileVersionUrn
                                    }
                                }
                            }
                        }
                    }
                }
            `;
        
        // AEC Data Model API usa endpoint global /aec/graphql
        const url = `https://developer.api.autodesk.com/aec/graphql`;
        
        const variables = projectId 
            ? { projectId: projectId }
            : { hubId: hubId };
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ query, variables })
        });
        
        if (!response.ok) {
            throw new Error(`AEC Data Model API não está disponível: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.errors && result.errors.length > 0) {
            const errorMessages = result.errors.map((e: any) => e.message).join("; ");
            throw new Error(`GraphQL errors: ${errorMessages}`);
        }
        
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(result.data || result, null, 2)
            }]
        };
    }
};
