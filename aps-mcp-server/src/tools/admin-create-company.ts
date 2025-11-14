import { z } from "zod";
import { getCachedClientCredentialsAccessToken, cleanAccountId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required"),
    name: z.string().min(1, "name is required"),
    trade: z.string().min(1, "trade is required. See https://aps.autodesk.com/en/docs/bim360/v1/overview/parameters/ for valid values"),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().url().optional(),
    description: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminCreateCompany: Tool<typeof schema> = {
    title: "admin-create-company",
    description: "Create a new company in an Autodesk Construction Cloud account using Admin API. Required parameters: name and trade. See https://aps.autodesk.com/en/docs/bim360/v1/overview/parameters/ for valid trade values.",
    schema,
    callback: async ({ accountId, name, trade, address, city, state, postalCode, country, phone, website, description }: SchemaType) => {
        try {
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const accountIdClean = cleanAccountId(accountId);
            // Use HQ API endpoint
            const url = buildApiUrl(`hq/v1/accounts/${accountIdClean}/companies`);
            
            const companyData: any = {
                name,
                trade
            };
            if (phone) companyData.phone = phone;
            if (website) companyData.website = website;
            if (description) companyData.description = description;
            
            // Build address object if any address fields are provided
            if (address || city || state || postalCode || country) {
                companyData.address = {};
                if (address) companyData.address.line1 = address;
                if (city) companyData.address.city = city;
                if (state) companyData.address.stateOrProvince = state;
                if (postalCode) companyData.address.postalCode = postalCode;
                if (country) companyData.address.country = country;
            }
            
            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(companyData)
            }, 30000, 0); // Sem retry para POST
            
            if (!response.ok) {
                throw await handleApiError(response, { operation: "create company", accountId: accountIdClean });
            }
            
            const company = await response.json() as any;
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(company)
                }]
            };
        } catch (error: any) {
            if (error instanceof Error && error.message.startsWith("{")) {
                throw error;
            }
            throw new Error(JSON.stringify({
                error: "Failed to create company",
                message: error?.message || error?.toString() || "Unknown error",
                accountId: accountId?.replace(/^b\./, "") || "unknown"
            }));
        }
    }
};

