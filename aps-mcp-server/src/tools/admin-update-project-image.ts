import { z } from "zod";
import { getAccessToken, cleanProjectId, buildApiUrl, fetchWithTimeout, handleApiError, type Session } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    projectId: z.string().min(1, "projectId is required"),
    imageUrl: z.string().url().optional(),
    imageData: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminUpdateProjectImage: Tool<typeof schema> = {
    title: "admin-update-project-image",
    description: "Update the image for a project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ projectId, imageUrl, imageData }: SchemaType, context?: { session?: Session }) => {
        try {
            if (!imageUrl && !imageData) {
                throw new Error("Either imageUrl or imageData must be provided");
            }

            const accessToken = await getAccessToken(["account:write"], context?.session);
            const projectIdClean = cleanProjectId(projectId);
            const url = buildApiUrl(`construction/admin/v1/projects/${projectIdClean}/image`);

            const imagePayload: any = {};
            if (imageUrl) imagePayload.imageUrl = imageUrl;
            if (imageData) imagePayload.imageData = imageData;

            const response = await fetchWithTimeout(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(imagePayload)
            }, 30000, 0); // Sem retry para PATCH

            if (!response.ok) {
                throw await handleApiError(response, { operation: "update project image", projectId: projectIdClean });
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
                error: "Failed to update project image",
                message: error?.message || error?.toString() || "Unknown error",
                projectId: projectId?.replace(/^b\./, "") || "unknown"
            }));
        }
    }
};

