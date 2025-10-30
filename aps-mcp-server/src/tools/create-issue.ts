import { z } from "zod";
import { getAccessToken, Tool } from "../auth.js";

const schema = {
    projectId: z.string().nonempty(),
    title: z.string().nonempty(),
    issueSubtypeId: z.string().nonempty(),
    status: z.enum(["draft", "open", "pending", "in_progress", "completed", "in_review", "not_approved", "in_dispute", "closed"]),
    description: z.string().optional(),
    assignedTo: z.string().optional(),
    assignedToType: z.enum(["user", "company", "role"]).optional(),
    dueDate: z.string().optional(),
    startDate: z.string().optional(),
    locationId: z.string().optional(),
    locationDetails: z.string().optional(),
    rootCauseId: z.string().optional(),
    published: z.boolean().optional()
};

export const createIssue: Tool<typeof schema> = {
    title: "create-issue",
    description: "Adds an issue to a project in Autodesk Construction Cloud.",
    schema,
    callback: async ({ projectId, title, issueSubtypeId, status, description, assignedTo, assignedToType, dueDate, startDate, locationId, locationDetails, rootCauseId, published }) => {
        const accessToken = await getAccessToken(["data:write"]);
        const url = `https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues`;
        
        const issueData: any = {
            title,
            issueSubtypeId,
            status
        };
        
        if (description) issueData.description = description;
        if (assignedTo) issueData.assignedTo = assignedTo;
        if (assignedToType) issueData.assignedToType = assignedToType;
        if (dueDate) issueData.dueDate = dueDate;
        if (startDate) issueData.startDate = startDate;
        if (locationId) issueData.locationId = locationId;
        if (locationDetails) issueData.locationDetails = locationDetails;
        if (rootCauseId) issueData.rootCauseId = rootCauseId;
        if (published !== undefined) issueData.published = published;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(issueData)
        });
        
        if (!response.ok) {
            throw new Error(`Could not create issue: ${await response.text()}`);
        }
        
        const issue = await response.json();
        return {
            content: [{
                type: "text",
                text: JSON.stringify({ id: issue.id, title: issue.title, status: issue.status, displayId: issue.displayId })
            }]
        };
    }
};
