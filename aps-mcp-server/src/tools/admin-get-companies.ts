import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required").optional(),
    trade: z.string().optional(),
    status: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminGetCompanies: Tool<typeof schema> = {
    title: "admin-get-companies",
    description: "Get all companies in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ accountId, trade, status }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        let url = `https://developer.api.autodesk.com/admin/v1/companies`;
        
        const params = new URLSearchParams();
        if (accountId) {
            // Remove "b." prefix from accountId if present
            const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
            params.append("accountId", accountIdClean);
        }
        if (trade) params.append("trade", trade);
        if (status) params.append("status", status);
        
        if (params.toString()) {
            url += `?${params.toString()}`;
        }
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not retrieve companies: ${await response.text()}`);
        }
        
        const data = await response.json();
        const companies = data.data || data.companies || data;
        return {
            content: Array.isArray(companies) ? companies.map((company: any) => ({
                type: "text" as const,
                text: JSON.stringify({
                    id: company.id,
                    name: company.name,
                    ...company
                })
            })) : [{
                type: "text" as const,
                text: JSON.stringify(companies)
            }]
        };
    }
};

