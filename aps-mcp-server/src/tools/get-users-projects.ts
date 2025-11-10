import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().nonempty(),
    userId: z.string().nonempty()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const getUserProjects: Tool<typeof schema> = {
    title: "get-user-projects",
    description: "Returns a list of projects for a specified user within an Autodesk Construction Cloud (ACC) or BIM 360 account.",
    schema,
    callback: async ({ accountId, userId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        
        // Remove "b." prefix from accountId if present
        const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
        const url = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountIdClean}/users/${userId}/projects`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Could not retrieve user projects: ${await response.text()}`);
        }
        const projects = await response.json();
        return {
            content: projects.map((project: any) => ({
                type: "text",
                text: JSON.stringify({ id: project.id, name: project.name, status: project.status, platform: project.platform })
            }))
        };
    }
};