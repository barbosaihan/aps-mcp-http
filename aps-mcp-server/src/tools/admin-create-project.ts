import { z } from "zod";
import { getCachedClientCredentialsAccessToken, cleanAccountId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
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
    callback: async ({ accountId, name, type, serviceTypes, templateId, region }: SchemaType) => {
        try {
            const accountIdClean = cleanAccountId(accountId);
            
            // Primeiro, validar o token tentando listar projetos (requer apenas account:read)
            // Isso ajuda a identificar se o problema é de autenticação ou permissões
            try {
                const readToken = await getCachedClientCredentialsAccessToken(["account:read"]);
                const testUrl = buildApiUrl(`construction/admin/v1/accounts/${accountIdClean}/projects`);
                const testResponse = await fetchWithTimeout(testUrl, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${readToken}`,
                        "Content-Type": "application/json"
                    }
                }, 30000, 0);
                
                if (!testResponse.ok && testResponse.status === 401) {
                    throw new Error(JSON.stringify({
                        error: "Authentication failed",
                        message: "Não foi possível autenticar com a API. Verifique se APS_CLIENT_ID e APS_CLIENT_SECRET estão corretos.",
                        statusCode: 401,
                        accountId: accountIdClean,
                        diagnostic: "Falha ao validar token com account:read - credenciais podem estar inválidas"
                    }));
                }
            } catch (testError: any) {
                // Se o erro já está formatado, re-lançar
                if (testError instanceof Error && testError.message.startsWith("{")) {
                    try {
                        JSON.parse(testError.message);
                        throw testError;
                    } catch {
                        // Continuar com o fluxo normal
                    }
                }
            }
            
            // Agora obter token com account:write para criar o projeto
            const accessToken = await getCachedClientCredentialsAccessToken(["account:write"]);
            const url = buildApiUrl(`construction/admin/v1/accounts/${accountIdClean}/projects`);
            
            const projectData: any = {
                name,
                type: type || "Commercial"  // Required: Project construction type (e.g., "Office", "Commercial", "Hospital", "Oil & Gas", etc.)
            };
            
            if (serviceTypes) projectData.serviceTypes = serviceTypes;
            if (templateId) projectData.templateId = templateId;
            if (region) projectData.region = region;
            
            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(projectData)
            }, 30000, 0); // Sem retry para POST
            
            if (!response.ok) {
                const errorResponse = await handleApiError(response, { operation: "create project", accountId: accountIdClean });
                const errorMessage = errorResponse.message;
                
                // Se for 401, adicionar informações de diagnóstico adicionais
                if (response.status === 401) {
                    throw new Error(JSON.stringify({
                        error: "Failed to create project",
                        message: errorMessage,
                        statusCode: 401,
                        accountId: accountIdClean,
                        diagnostic: "Token foi gerado com sucesso, mas a API rejeitou a requisição. Possíveis causas:",
                        possibleCauses: [
                            "A aplicação não está registrada como 'Custom Integration' no Autodesk Construction Cloud",
                            "A aplicação não tem permissão para acessar a conta especificada",
                            "O scope 'account:write' não está habilitado para esta aplicação",
                            "A aplicação não tem permissões de administrador na conta"
                        ],
                        troubleshooting: [
                            "Verifique no portal ACC se a aplicação está registrada como Custom Integration",
                            "Verifique se o APS_CLIENT_ID está associado à conta no ACC",
                            "Verifique se a aplicação tem permissões de administrador",
                            "Confirme que o scope 'account:write' está habilitado na configuração da aplicação APS"
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

