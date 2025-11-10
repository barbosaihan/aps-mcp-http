import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    q: z.string().min(1, "search query is required"),
    accountId: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminSearchCompanies: Tool<typeof schema> = {
    title: "admin-search-companies",
    description: "Search for companies in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ q, accountId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        let url = `https://developer.api.autodesk.com/admin/v1/companies/search`;
        
        const params = new URLSearchParams();
        params.append("q", q);
        if (accountId) {
            // Remove "b." prefix from accountId if present
            const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
            params.append("accountId", accountIdClean);
        }
        
        url += `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not search companies: ${await response.text()}`);
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

