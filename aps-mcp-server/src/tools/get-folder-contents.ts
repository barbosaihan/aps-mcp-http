import { z } from "zod";
import { DataManagementClient } from "@aps_sdk/data-management";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().nonempty().optional(),
    projectId: z.string().nonempty(),
    folderId: z.string().optional()
};

export const getFolderContents: Tool<typeof schema> = {
    title: "get-folder-contents",
    description: "List contents of a project or a specific subfolder in Autodesk Construction Cloud. accountId is required when folderId is not provided.",
    schema,
    callback: async ({ accountId, projectId, folderId }) => {
        // Validate that accountId is provided when folderId is not
        if (!folderId && !accountId) {
            throw new Error("accountId is required when folderId is not provided");
        }
        
        // TODO: add pagination support
        const accessToken = await getAccessToken(["data:read"]);
        const dataManagementClient = new DataManagementClient();
        const contents = folderId
            ? await dataManagementClient.getFolderContents(projectId, folderId, { accessToken })
            : await dataManagementClient.getProjectTopFolders(accountId!, projectId, { accessToken });
        if (!contents.data) {
            throw new Error("No contents found");
        }
        return {
            content: contents.data.map((item) => ({ type: "text", text: JSON.stringify(item) }))
        };
    }
};