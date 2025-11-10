import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().nonempty()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const getIssueSubtypes: Tool<typeof schema> = {
    title: "get-issue-subtypes",
    description: "Retrieves all issue types with their subtypes in an Autodesk Construction Cloud project.",
    schema,
    callback: async ({ projectId }: SchemaType) => {
        const accessToken = await getAccessToken(["data:read"]);
        // Remove "b." prefix if present
        const cleanProjectId = projectId.replace("b.", "");
        const url = `https://developer.api.autodesk.com/construction/issues/v1/projects/${cleanProjectId}/issue-types?include=subtypes`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not retrieve issue subtypes: ${await response.text()}`);
        }
        
        const data = await response.json();
        
        // Extract subtypes from the response
        const subtypes: any[] = [];
        if (data.results) {
            for (const issueType of data.results) {
                if (issueType.subtypes && issueType.subtypes.length > 0) {
                    for (const subtype of issueType.subtypes) {
                        subtypes.push({
                            id: subtype.id,
                            title: subtype.title,
                            issueTypeId: issueType.id,
                            issueTypeTitle: issueType.title
                        });
                    }
                }
            }
        }
        
        return {
            content: subtypes.map((subtype) => ({ 
                type: "text", 
                text: JSON.stringify(subtype) 
            }))
        };
    }
};

