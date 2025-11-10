import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    companyId: z.string().min(1, "companyId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetCompany: Tool<typeof schema> = {
    title: "admin-get-company",
    description: "Get detailed information about a specific company in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ companyId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        const url = `https://developer.api.autodesk.com/admin/v1/companies/${companyId}`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not retrieve company: ${await response.text()}`);
        }
        
        const company = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(company)
            }]
        };
    }
};

