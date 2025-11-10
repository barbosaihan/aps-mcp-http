import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
import type { Tool } from "./common.js";

const schema = {
    companyId: z.string().min(1, "companyId is required"),
    imageUrl: z.string().url().optional(),
    imageData: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminUpdateCompanyImage: Tool<typeof schema> = {
    title: "admin-update-company-image",
    description: "Update the image for a company in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ companyId, imageUrl, imageData }: SchemaType) => {
        if (!imageUrl && !imageData) {
            throw new Error("Either imageUrl or imageData must be provided");
        }
        
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        const url = `https://developer.api.autodesk.com/admin/v1/companies/${companyId}/image`;
        
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
            throw new Error(`Could not update company image: ${await response.text()}`);
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

