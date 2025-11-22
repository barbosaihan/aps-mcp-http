import { z } from "zod";
import { getAccessToken, cleanAccountId, buildApiUrl, fetchWithTimeout, handleApiError, type Session } from "./common.js";
import { logger } from "../utils/logger.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required"),
    name: z.string().min(1, "name is required"),
    type: z.string().optional().default("Commercial"), // Project construction type (e.g., "Office", "Commercial", "Hospital", "Oil & Gas", etc.)
    serviceTypes: z.array(z.string()).optional(),
    templateId: z.string().optional(),
    region: z.string().optional()
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

export const adminCreateProject: Tool<typeof schema> = {
    title: "admin-create-project",
    description: "Create a new project in Autodesk Construction Cloud using Admin API",
    schema,
    callback: async ({ accountId, name, type, serviceTypes, templateId, region }: SchemaType, context?: { session?: Session }) => {
        try {
            const accountIdClean = cleanAccountId(accountId);

            // Obter token com account:write para criar o projeto
            // Usar token OAuth do usuário
            let accessToken: string;
            let useAlternativeEndpoint = false;

            try {
                accessToken = await getAccessToken(["account:write"], context?.session);
            } catch (error) {
                logger.error("Failed to get OAuth token for create project", error as Error);
                throw error;
            }

            // Tentar diferentes endpoints da API (alguns podem usar hq/v1, outros construction/admin/v1)
            let url = buildApiUrl(`construction/admin/v1/accounts/${accountIdClean}/projects`);

            const projectData: any = {
                name,
                type: type || "Commercial"  // Required: Project construction type (e.g., "Office", "Commercial", "Hospital", "Oil & Gas", etc.)
            };

            if (serviceTypes) projectData.serviceTypes = serviceTypes;
            if (templateId) projectData.templateId = templateId;
            if (region) projectData.region = region;

            let response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(projectData)
            }, 30000, 0); // Sem retry para POST

            // Se o endpoint construction/admin/v1 retornar 401 ou 404, tentar o endpoint hq/v1
            if (!response.ok && (response.status === 401 || response.status === 404)) {
                try {
                    url = buildApiUrl(`hq/v1/accounts/${accountIdClean}/projects`);
                    response = await fetchWithTimeout(url, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${accessToken}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(projectData)
                    }, 30000, 0);
                    useAlternativeEndpoint = true;
                } catch (altError) {
                    // Se o endpoint alternativo também falhar, continuar com o erro original
                }
            }

            if (!response.ok) {
                const errorResponse = await handleApiError(response, {
                    operation: "create project",
                    accountId: accountIdClean,
                    endpoint: useAlternativeEndpoint ? "hq/v1" : "construction/admin/v1"
                });
                const errorMessage = errorResponse.message;

                // Se for 401, adicionar informações de diagnóstico adicionais
                if (response.status === 401) {
                    throw new Error(JSON.stringify({
                        error: "Failed to create project",
                        message: errorMessage,
                        statusCode: 401,
                        accountId: accountIdClean,
                        endpointUsed: useAlternativeEndpoint ? "hq/v1" : "construction/admin/v1",
                        diagnostic: "Token foi gerado com sucesso, mas a API rejeitou a requisição. Outras tools funcionam, mas criar projetos requer permissões específicas.",
                        possibleCauses: [
                            "A aplicação pode não ter permissão específica para criar projetos (diferente de outras operações)",
                            "O endpoint de criação de projetos pode requerer permissões de administrador de conta",
                            "Pode ser necessário ativar explicitamente a permissão de criação de projetos no ACC",
                            "A conta pode ter restrições específicas para criação de projetos"
                        ],
                        troubleshooting: [
                            "Verifique no portal ACC se há permissões específicas para criação de projetos",
                            "Tente criar um projeto manualmente no ACC para verificar se há restrições",
                            "Verifique se a conta tem limite de projetos ou se precisa de aprovação",
                            "Confirme que você tem permissões de Account Admin, não apenas Project Admin"
                        ]
                    }));
                }

                throw errorResponse;
            }

            const project = await response.json() as any;
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        id: project.id,
                        name: project.name,
                        accountId: project.accountId,
                        ...project
                    })
                }]
            };
        } catch (error: any) {
            // Se o erro já está formatado como JSON, re-lançar
            if (error instanceof Error && error.message.startsWith("{")) {
                try {
                    // Tentar parsear para verificar se é JSON válido
                    JSON.parse(error.message);
                    throw error;
                } catch {
                    // Não é JSON válido, continuar com o tratamento padrão
                }
            }

            // Extrair mensagem do erro
            let errorMessage = error?.message || error?.toString() || "Unknown error";

            // Se o erro contém informações de autenticação, destacar isso
            if (errorMessage.includes("Authentication") || errorMessage.includes("credentials") || errorMessage.includes("401")) {
                throw new Error(JSON.stringify({
                    error: "Failed to create project",
                    message: `Erro de autenticação: ${errorMessage}. Verifique se as credenciais APS_CLIENT_ID e APS_CLIENT_SECRET estão configuradas corretamente no arquivo .env e têm permissões para criar projetos (scope: account:write)`,
                    statusCode: 401,
                    accountId: accountId?.replace(/^b\./, "") || "unknown",
                    hint: "Certifique-se de que a aplicação APS tem acesso à conta e permissões necessárias para criar projetos"
                }));
            }

            throw new Error(JSON.stringify({
                error: "Failed to create project",
                message: errorMessage,
                accountId: accountId?.replace(/^b\./, "") || "unknown"
            }));
        }
    }
};

