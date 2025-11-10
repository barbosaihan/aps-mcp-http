import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
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
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        
        // Remove "b." prefix from accountId if present
        const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
        // Use HQ API endpoint
        const url = `https://developer.api.autodesk.com/hq/v1/accounts/${accountIdClean}/companies`;
        
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
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(companyData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            const errorMessage = `Could not create company: ${errorText}`;
            // Log the request details for debugging
            console.error("Request URL:", url);
            console.error("Request body:", JSON.stringify(companyData, null, 2));
            console.error("Response status:", response.status);
            throw new Error(errorMessage);
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

