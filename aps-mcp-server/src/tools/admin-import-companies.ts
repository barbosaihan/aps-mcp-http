import { z } from "zod";
import { getAccessToken, cleanAccountId, buildApiUrl, fetchWithTimeout, handleApiError, type Session } from "./common.js";
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
    callback: async ({ companies }: SchemaType, context?: { session?: Session }) => {
        try {
            const accessToken = await getAccessToken(["account:write"], context?.session);
            const url = buildApiUrl(`admin/v1/companies/import`);

            // Remove "b." prefix from accountId in each company if present
            const cleanedCompanies = companies.map(company => ({
                ...company,
                accountId: cleanAccountId(company.accountId)
            }));

            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ companies: cleanedCompanies })
            }, 30000, 0); // Sem retry para POST

            if (!response.ok) {
                throw await handleApiError(response, { operation: "import companies", companyCount: companies.length });
            }

            const result = await response.json() as any;
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(result)
                }]
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to import companies",
                message: error?.message || error?.toString() || "Unknown error",
                companyCount: companies.length
            }));
        }
    }
};

