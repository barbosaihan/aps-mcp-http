import { z } from "zod";
import { getAccessToken, buildApiUrl, fetchWithTimeout, handleApiError, type Session } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    companyId: z.string().min(1, "companyId is required"),
    name: z.string().optional(),
    trade: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().url().optional(),
    description: z.string().optional(),
    status: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminUpdateCompany: Tool<typeof schema> = {
    title: "admin-update-company",
    description: "Update a company's information in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ companyId, name, trade, address, city, state, postalCode, country, phone, website, description, status }: SchemaType, context?: { session?: Session }) => {
        try {
            const accessToken = await getAccessToken(["account:write"], context?.session);
            const url = buildApiUrl(`admin/v1/companies/${companyId}`);

            const companyData: any = {};
            if (name) companyData.name = name;
            if (trade) companyData.trade = trade;
            if (address) companyData.address = address;
            if (city) companyData.city = city;
            if (state) companyData.state = state;
            if (postalCode) companyData.postalCode = postalCode;
            if (country) companyData.country = country;
            if (phone) companyData.phone = phone;
            if (website) companyData.website = website;
            if (description) companyData.description = description;
            if (status) companyData.status = status;

            const response = await fetchWithTimeout(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(companyData)
            }, 30000, 0); // Sem retry para PATCH

            if (!response.ok) {
                throw await handleApiError(response, { operation: "update company", companyId });
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
                error: "Failed to update company",
                message: error?.message || error?.toString() || "Unknown error",
                companyId: companyId || "unknown"
            }));
        }
    }
};

