import { z } from "zod";
import { getAccessToken, Tool } from "../auth.js";

const schema = {
    accountId: z.string().nonempty(),
    userId: z.string().nonempty()
};

export const getUserProjects: Tool<typeof schema> = {
    title: "get-user-projects",
    description: "Returns a list of projects for a specified user within an Autodesk Construction Cloud (ACC) or BIM 360 account.",
    schema,
    callback: async ({ accountId, userId }) => {
        const accessToken = await getAccessToken(["account:read"]);
        const url = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/users/${userId}/projects`;
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