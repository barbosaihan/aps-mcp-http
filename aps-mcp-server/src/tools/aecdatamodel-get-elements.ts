import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    elementGroupId: z.string().min(1, "elementGroupId is required"),
    filter: z.string().optional().describe("Optional filter to apply (e.g., category filter like: property.name.category==Walls)"),
    fields: z.array(z.string()).optional().describe("Specific fields to retrieve"),
    limit: z.number().optional().describe("Maximum number of elements to return"),
    offset: z.number().optional().describe("Offset for pagination")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

/**
 * AEC Data Model API - Get Model Elements
 * 
 * Retrieves elements from a Revit model using GraphQL.
 * This is more efficient than the old Model Properties API.
 */
export const aecdatamodelGetElements: Tool<typeof schema> = {
    title: "aecdatamodel-get-elements",
    description: "Get elements from a Revit model using the AEC Data Model API GraphQL endpoint",
    schema,
    callback: async ({ elementGroupId, filter, fields, limit = 100, offset = 0 }: SchemaType) => {
        const accessToken = await getAccessToken(["data:read"]);
        
        // Build GraphQL query based on requested fields
        const requestedFields = fields && fields.length > 0 
            ? fields.join("\n                    ")
            : `id
                    name
                    properties {
                        results {
                            name
                            value
                        }
                    }`;
        
        // Build filter clause if provided
        const queryString = `
            query GetElementsByElementGroupWithFilter($elementGroupId: ID!, $filter: String!) {
                elementsByElementGroup(elementGroupId: $elementGroupId, filter: {query: $filter}) {
                    results {
                        ${requestedFields}
                    }
                }
            }
        `;
        
        const variables: any = { elementGroupId };
        if (filter) {
            variables.filter = filter;
        } else {
            variables.filter = ""; // Empty filter to get all elements
        }
        
        const url = `https://developer.api.autodesk.com/aec/graphql`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                query: queryString,
                variables
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Could not retrieve elements: ${response.status} ${response.statusText} - ${errorText}`);
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

