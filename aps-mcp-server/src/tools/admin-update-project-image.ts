import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    imageUrl: z.string().url().optional(),
    imageData: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminUpdateProjectImage: Tool<typeof schema> = {
    title: "admin-update-project-image",
    description: "Update the image for a project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ projectId, imageUrl, imageData }: SchemaType) => {
        if (!imageUrl && !imageData) {
            throw new Error("Either imageUrl or imageData must be provided");
        }
        
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        
        // Remove "b." prefix from projectId if present
        const projectIdClean = projectId.startsWith("b.") ? projectId.substring(2) : projectId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectIdClean}/image`;
        
        const imagePayload: any = {};
        if (imageUrl) imagePayload.imageUrl = imageUrl;
        if (imageData) imagePayload.imageData = imageData;
        
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(imagePayload)
        });
        
        if (!response.ok) {
            throw new Error(`Could not update project image: ${await response.text()}`);
        }
        
        const result = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(result)
            }]
        };
    }
};

