import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    itemId: z.string().min(1, "itemId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

/**
 * AEC Data Model API - Get GraphQL Schema
 * 
 * Retrieves the GraphQL schema/introspection for a specific model.
 * This helps understand what data is available for querying.
 */
export const aecdatamodelGetSchema: Tool<typeof schema> = {
    title: "aecdatamodel-get-schema",
    description: "Get the GraphQL schema for a specific model in the AEC Data Model API",
    schema,
    callback: async ({ projectId, itemId }: SchemaType) => {
        const accessToken = await getAccessToken(["data:read"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.replace("b.", "");
        const url = `https://developer.api.autodesk.com/aecdatamodel/v1/projects/${projectIdClean}/items/${itemId}/graphql`;
        
        // GraphQL introspection query
        const introspectionQuery = `{
            __schema {
                types {
                    name
                    kind
                    description
                    fields {
                        name
                        description
                        type {
                            name
                            kind
                        }
                    }
                }
            }
        }`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query: introspectionQuery
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Could not retrieve schema: ${response.status} ${response.statusText} - ${errorText}`);
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

