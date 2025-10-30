import { z } from "zod";
import { getAccessToken, Tool } from "../auth.js";

const schema = {
    accountId: z.string().nonempty()
};

export const getUsersByAccount: Tool<typeof schema> = {
    title: "get-users-by-account",
    description: "Query all the users in a specific BIM 360 account.",
    schema,
    callback: async ({ accountId }) => {
        const accessToken = await getAccessToken(["account:read"]);
        const url = `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Could not retrieve users: ${await response.text()}`);
        }
        const users = await response.json();
        return {
            content: users.map((user: any) => ({
                type: "text",
                text: JSON.stringify({ id: user.id, email: user.email, name: user.name })
            }))
        };
    }
};
