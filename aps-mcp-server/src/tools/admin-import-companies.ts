import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
import type { Tool } from "./common.js";

const schema = {
    companies: z.array(z.object({
        accountId: z.string().min(1),
        name: z.string().min(1),
        trade: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().url().optional(),
        description: z.string().optional()
    }))
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminImportCompanies: Tool<typeof schema> = {
    title: "admin-import-companies",
    description: "Import multiple companies to an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ companies }: SchemaType) => {
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        const url = `https://developer.api.autodesk.com/admin/v1/companies/import`;
        
        // Remove "b." prefix from accountId in each company if present
        const cleanedCompanies = companies.map(company => ({
            ...company,
            accountId: company.accountId.startsWith("b.") ? company.accountId.substring(2) : company.accountId
        }));
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ companies: cleanedCompanies })
        });
        
        if (!response.ok) {
            throw new Error(`Could not import companies: ${await response.text()}`);
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

