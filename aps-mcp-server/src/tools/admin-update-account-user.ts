import { z } from "zod";
import { getClientCredentialsAccessToken } from "../auth.js";
import { APS_CLIENT_ID, APS_CLIENT_SECRET } from "../config.js";
import type { Tool } from "./common.js";

const schema = {
    userId: z.string().min(1, "userId is required"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    jobTitle: z.string().optional(),
    companyId: z.string().optional(),
    roleIds: z.array(z.string()).optional(),
    status: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminUpdateAccountUser: Tool<typeof schema> = {
    title: "admin-update-account-user",
    description: "Update a user's information in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ userId, firstName, lastName, phone, jobTitle, companyId, roleIds, status }: SchemaType) => {
        const { access_token: accessToken } = await getClientCredentialsAccessToken(APS_CLIENT_ID!, APS_CLIENT_SECRET!, ["account:write"]);
        const url = `https://developer.api.autodesk.com/admin/v1/users/${userId}`;
        
        const userData: any = {};
        if (firstName) userData.firstName = firstName;
        if (lastName) userData.lastName = lastName;
        if (phone) userData.phone = phone;
        if (jobTitle) userData.jobTitle = jobTitle;
        if (companyId) userData.companyId = companyId;
        if (roleIds) userData.roleIds = roleIds;
        if (status) userData.status = status;
        
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            throw new Error(`Could not update user: ${await response.text()}`);
        }
        
        const user = await response.json();
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify(user)
            }]
        };
    }
};

