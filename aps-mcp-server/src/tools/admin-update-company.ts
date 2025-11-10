import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
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
    callback: async ({ companyId, name, trade, address, city, state, postalCode, country, phone, website, description, status }: SchemaType) => {
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        const url = `https://developer.api.autodesk.com/admin/v1/companies/${companyId}`;
        
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
        
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(companyData)
        });
        
        if (!response.ok) {
            throw new Error(`Could not update company: ${await response.text()}`);
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

