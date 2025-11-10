import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    itemId: z.string().min(1, "itemId is required"),
    query: z.string().min(1, "GraphQL query string is required"),
    variables: z.record(z.any()).optional().describe("Optional GraphQL variables")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

/**
 * AEC Data Model API - Execute GraphQL Query
 * 
 * This API provides programmatic access to AEC project data using GraphQL.
 * Benefits over Model Properties API:
 * - More flexible queries with GraphQL
 * - Automatic generation for Revit 2024/2025 models
 * - Unified data access
 * - More efficient data retrieval
 * 
 * Reference: https://aps.autodesk.com/en/docs/aecdatamodel/v1/developers_guide/overview/
 */
export const aecdatamodelExecuteQuery: Tool<typeof schema> = {
    title: "aecdatamodel-execute-query",
    description: "Execute a GraphQL query against the AEC Data Model API to retrieve model data from Revit 2024/2025 files",
    schema,
    callback: async ({ projectId, itemId, query, variables }: SchemaType) => {
        const accessToken = await getAccessToken(["data:read"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.replace("b.", "");
        // AEC Data Model API GraphQL endpoint (global endpoint, not per-project)
        const url = `https://developer.api.autodesk.com/aec/graphql`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query,
                variables: variables || {}
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GraphQL query failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        // Check for GraphQL errors
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

