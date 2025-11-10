import { z } from "zod";
import { getAccessToken } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    q: z.string().min(1, "search query is required"),
    accountId: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminSearchAccountUsers: Tool<typeof schema> = {
    title: "admin-search-account-users",
    description: "Search for users in an Autodesk Construction Cloud account using Admin API",
    schema,
    callback: async ({ q, accountId }: SchemaType) => {
        const accessToken = await getAccessToken(["account:read"]);
        // Use o endpoint /admin/v1/users com filtros (mesmo padrão de admin-get-account-users)
        let url = `https://developer.api.autodesk.com/admin/v1/users`;
        
        const params = new URLSearchParams();
        if (accountId) {
            // Remove "b." prefix from accountId if present
            const accountIdClean = accountId.startsWith("b.") ? accountId.substring(2) : accountId;
            params.append("accountId", accountIdClean);
        }
        // Adicionar parâmetro q para busca se suportado, senão filtrar localmente
        // A API pode não suportar busca direta, então vamos buscar todos e filtrar
        if (params.toString()) {
            url += `?${params.toString()}`;
        }
        
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not search users: ${await response.text()}`);
        }
        
        const data = await response.json();
        const allUsers = data.data || data.users || (Array.isArray(data) ? data : []);
        
        // Filtrar localmente pela query string (busca em email, nome, etc)
        const searchTerm = q.toLowerCase();
        const filteredUsers = Array.isArray(allUsers) ? allUsers.filter((user: any) => {
            const email = (user.email || "").toLowerCase();
            const name = ((user.name || "") || `${user.firstName || ""} ${user.lastName || ""}`.trim()).toLowerCase();
            return email.includes(searchTerm) || name.includes(searchTerm);
        }) : [];
        
        return {
            content: filteredUsers.map((user: any) => ({
                type: "text" as const,
                text: JSON.stringify({
                    id: user.id,
                    email: user.email,
                    name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
                    ...user
                })
            }))
        };
    }
};

