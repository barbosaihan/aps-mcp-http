import { z } from "zod";
import { DataManagementClient } from "@aps_sdk/data-management";
import { getAccessToken, cleanAccountId, buildApiUrl, fetchWithTimeout, handleApiError } from "./common.js";
import type { Tool } from "./common.js";

const schema = {
    accountId: z.string().min(1, "accountId is required")
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

// Extensões de arquivos BIM que queremos buscar
const BIM_FILE_EXTENSIONS = ['.dwg', '.ifc', '.rvt', '.nwd', '.nwf'];
const BIM_FILE_EXTENSIONS_UPPER = BIM_FILE_EXTENSIONS.map(ext => ext.toUpperCase());

/**
 * Verifica se um arquivo é um modelo BIM baseado na extensão
 */
function isBimModelFile(fileName: string): boolean {
    const lowerFileName = fileName.toLowerCase();
    return BIM_FILE_EXTENSIONS.some(ext => lowerFileName.endsWith(ext)) ||
           BIM_FILE_EXTENSIONS_UPPER.some(ext => fileName.endsWith(ext));
}

/**
 * Busca arquivos recursivamente em uma pasta
 */
async function searchFilesInFolder(
    dataManagementClient: DataManagementClient,
    projectId: string,
    folderId: string,
    accessToken: string,
    models: any[],
    projectName: string,
    maxModels: number = 1000  // Limite máximo de modelos para evitar loops infinitos
): Promise<void> {
    // Se já atingiu o limite, parar a busca
    if (models.length >= maxModels) {
        return;
    }
    try {
        // Buscar conteúdo da pasta
        const contents = await dataManagementClient.getFolderContents(projectId, folderId, { accessToken });
        
        if (!contents.data) {
            return;
        }

        // Processar cada item na pasta
        for (const item of contents.data) {
            if (item.type === 'folders') {
                // Se for uma pasta, buscar recursivamente (apenas se não atingiu o limite)
                if (models.length >= maxModels) {
                    return;
                }
                const subFolderId = item.id;
                if (subFolderId) {
                    await searchFilesInFolder(dataManagementClient, projectId, subFolderId, accessToken, models, projectName, maxModels);
                }
            } else if (item.type === 'items') {
                // Se for um item (arquivo), verificar se é um modelo BIM
                const fileName = item.attributes?.displayName || '';
                
                if (isBimModelFile(fileName)) {
                    try {
                        // Buscar versões do item
                        const versions = await dataManagementClient.getItemVersions(projectId, item.id, { accessToken });
                        
                        if (versions.data && versions.data.length > 0) {
                            // Processar cada versão (geralmente queremos a versão mais recente)
                            // Vamos processar todas as versões para ter histórico completo
                            for (const version of versions.data) {
                                const versionAttributes = version.attributes || {};
                                const storageData = version.relationships?.storage?.data;
                                const versionData = version as any; // Usar any para acessar propriedades que podem não estar tipadas
                                
                                // Log removido para melhorar performance
                                
                                // Extrair informações do modelo
                                const modelInfo: any = {
                                    projectId: projectId,
                                    projectName: projectName,
                                    fileName: fileName,
                                    fileType: fileName.substring(fileName.lastIndexOf('.') + 1).toUpperCase(),
                                    itemId: item.id,
                                    versionId: version.id,
                                    versionNumber: versionAttributes.versionNumber || 1,
                                    createTime: versionAttributes.createTime || '',
                                    createUserName: versionAttributes.createUserName || '',
                                    displayName: item.attributes?.displayName || fileName,
                                    extension: {
                                        type: item.attributes?.extension?.type || ''
                                    }
                                };

                                // Tentar obter informações de storage e URN
                                if (storageData) {
                                    modelInfo.storageId = storageData.id;
                                    modelInfo.storageType = storageData.type;
                                    // URN pode estar no storage ID ou em relationships
                                    if (storageData.id && storageData.id.startsWith('urn:')) {
                                        modelInfo.urn = storageData.id;
                                    }
                                }

                                // Verificar em derivatives para obter URN
                                const derivativesData = version.relationships?.derivatives?.data;
                                if (derivativesData && derivativesData.id) {
                                    if (!modelInfo.urn && derivativesData.id.startsWith('urn:')) {
                                        modelInfo.urn = derivativesData.id;
                                    }
                                }

                                // Tentar obter tamanho do arquivo - verificar múltiplas fontes
                                // A API Data Management retorna o tamanho em version.attributes.storageSize (mais comum)
                                // 1. version.attributes.storageSize (campo mais comum na API)
                                if (versionAttributes && (versionAttributes as any).storageSize) {
                                    modelInfo.fileSize = (versionAttributes as any).storageSize;
                                }
                                // 2. version.attributes.storage.size (formato alternativo)
                                else if (versionData.attributes?.storage?.size) {
                                    modelInfo.fileSize = versionData.attributes.storage.size;
                                    modelInfo.storageLocation = versionData.attributes.storage.location || '';
                                }
                                // 3. version.attributes.size (formato alternativo)
                                else if (versionAttributes && (versionAttributes as any).size) {
                                    modelInfo.fileSize = (versionAttributes as any).size;
                                }
                                // 4. storageData.size (pode estar no objeto storage)
                                else if (storageData && (storageData as any).size) {
                                    modelInfo.fileSize = (storageData as any).size;
                                    modelInfo.storageLocation = (storageData as any).location || '';
                                }
                                // 5. item.attributes.size (última tentativa)
                                else if (item.attributes) {
                                    const itemAttributes = item.attributes as any;
                                    if (itemAttributes?.size) {
                                        modelInfo.fileSize = itemAttributes.size;
                                    } else if (itemAttributes?.fileSize) {
                                        modelInfo.fileSize = itemAttributes.fileSize;
                                    } else {
                                        modelInfo.fileSize = 0;
                                    }
                                } else {
                                    modelInfo.fileSize = 0;
                                }

                                // Construir links úteis
                                const links: any = {
                                    viewInACC: `https://acc.autodesk.com/projects/${projectId}/folders/${folderId}/items/${item.id}`,
                                    itemId: item.id,
                                    versionId: version.id
                                };

                                // Se tiver URN, adicionar link para visualização no Viewer
                                // NOTA: O APS Viewer requer que o arquivo seja convertido primeiro
                                // Se não houver URN convertido, usamos o link do ACC como fallback
                                if (modelInfo.urn && modelInfo.urn.startsWith('urn:')) {
                                    // Codificar URN para URL (base64url) - o URN já é uma string
                                    try {
                                        // Converter URN string para base64
                                        const urnBase64 = Buffer.from(modelInfo.urn, 'utf8').toString('base64')
                                            .replace(/\+/g, '-')  // Substituir + por -
                                            .replace(/\//g, '_')  // Substituir / por _
                                            .replace(/=/g, '');   // Remover padding =
                                        links.viewerUrl = `https://aps.autodesk.com/viewer?urn=${urnBase64}`;
                                    } catch (e) {
                                        // Se falhar a codificação, usar link do ACC como fallback
                                        // Usar link do ACC como fallback
                                        links.viewerUrl = links.viewInACC || '';
                                    }
                                } else {
                                    // Se não tiver URN, usar link do ACC para visualização
                                    // O ACC permite visualizar arquivos mesmo sem conversão
                                    links.viewerUrl = links.viewInACC || '';
                                }

                                // Adicionar link de download se disponível
                                if (modelInfo.storageLocation) {
                                    links.downloadUrl = modelInfo.storageLocation;
                                }

                                modelInfo.links = links;

                                models.push(modelInfo);
                            }
                        } else {
                            // Se não houver versões, adicionar apenas informações do item
                            models.push({
                                projectId: projectId,
                                projectName: projectName,
                                fileName: fileName,
                                fileType: fileName.substring(fileName.lastIndexOf('.') + 1).toUpperCase(),
                                itemId: item.id,
                                versionId: '',
                                versionNumber: 0,
                                createTime: (item.attributes as any)?.createTime || '',
                                createUserName: (item.attributes as any)?.createUserName || '',
                                fileSize: 0,
                                displayName: item.attributes?.displayName || fileName,
                                extension: {
                                    type: item.attributes?.extension?.type || ''
                                },
                                urn: '',
                                links: {
                                    viewInACC: `https://acc.autodesk.com/projects/${projectId}/folders/${folderId}/items/${item.id}`,
                                    itemId: item.id
                                }
                            });
                        }
                    } catch (error: any) {
                        // Se houver erro ao buscar versões, continuar com o próximo arquivo
                        console.error(`Error fetching versions for item ${item.id}:`, error.message);
                    }
                }
            }
        }
    } catch (error: any) {
        // Se houver erro ao buscar conteúdo da pasta, continuar com a próxima
        console.error(`Error searching folder ${folderId}:`, error.message);
    }
}

/**
 * Formata os modelos em formato de tabela
 */
function formatModelsAsTable(models: any[]): string {
    if (models.length === 0) {
        return "Nenhum modelo BIM encontrado.";
    }

    // Cabeçalho da tabela
    const headers = [
        "Project Name",
        "File Name",
        "File Type",
        "Version",
        "File Size",
        "Created By",
        "Created At",
        "View in ACC",
        "Viewer URL"
    ];

    // Linhas da tabela
    const rows = models.map(model => {
        const fileSize = model.fileSize > 0 
            ? `${(model.fileSize / 1024 / 1024).toFixed(2)} MB`
            : 'N/A';
        
        const createdBy = model.createUserName || 'N/A';
        const createdAt = model.createTime 
            ? new Date(model.createTime).toLocaleString()
            : 'N/A';
        
        const viewInACC = model.links?.viewInACC || 'N/A';
        const viewerUrl = model.links?.viewerUrl || 'N/A';

        return [
            model.projectName || 'N/A',
            model.fileName || 'N/A',
            model.fileType || 'N/A',
            model.versionNumber?.toString() || 'N/A',
            fileSize,
            createdBy,
            createdAt,
            viewInACC,
            viewerUrl
        ];
    });

    // Construir tabela em formato Markdown
    let table = `| ${headers.join(' | ')} |\n`;
    table += `| ${headers.map(() => '---').join(' | ')} |\n`;
    
    for (const row of rows) {
        table += `| ${row.join(' | ')} |\n`;
    }

    // Adicionar informações adicionais em formato JSON para referência
    table += `\n\n## Detalhes dos Modelos (JSON)\n\n\`\`\`json\n${JSON.stringify(models, null, 2)}\n\`\`\`\n`;

    return table;
}

export const getAllBimModels: Tool<typeof schema> = {
    title: "get-all-bim-models",
    description: "Busca todos os modelos BIM (DWG, IFC, RVT, NWD, NWF) em todos os projetos de uma conta Autodesk Construction Cloud. Retorna informações detalhadas incluindo links para visualização.",
    schema,
    callback: async ({ accountId }: SchemaType) => {
        try {
            const accessToken = await getAccessToken(["data:read", "account:read"]);
            const dataManagementClient = new DataManagementClient();
            
            // Validar accountId
            if (!accountId || accountId.trim() === '') {
                throw new Error("accountId é obrigatório e não pode estar vazio");
            }

            // Para getHubProjects, o accountId deve ter o prefixo "b." ou ser URN
            // Se não tiver prefixo, vamos tentar com e sem
            let accountIdForHub = accountId;
            if (!accountId.startsWith('b.') && !accountId.startsWith('urn:')) {
                // Tentar com prefixo "b." primeiro
                accountIdForHub = `b.${accountId}`;
            }
            
            // Para Admin API, precisamos do accountId sem prefixo
            const accountIdClean = cleanAccountId(accountId);
            
            // 1. Listar todos os projetos da conta usando Admin API (mais confiável)
            let projects: any[] = [];
            try {
                const url = buildApiUrl(`construction/admin/v1/accounts/${accountIdClean}/projects`);
                const response = await fetchWithTimeout(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }, 30000, 2);

                if (!response.ok) {
                    throw await handleApiError(response, { operation: "list projects", accountId: accountIdClean });
                }

                const data = await response.json() as any;
                projects = data.results || data.data || data.projects || (Array.isArray(data) ? data : []);
            } catch (adminError: any) {
                // Se Admin API falhar, tentar usar Data Management API
                console.warn(`Admin API failed, trying Data Management API: ${adminError.message}`);
                try {
                    const hubProjects = await dataManagementClient.getHubProjects(accountIdForHub, { accessToken });
                    if (hubProjects.data) {
                        projects = hubProjects.data.map((p: any) => ({
                            id: p.id,
                            name: p.attributes?.name || p.name
                        }));
                    }
                } catch (dmError: any) {
                    throw new Error(`Não foi possível listar projetos. Admin API: ${adminError.message}. Data Management API: ${dmError.message}`);
                }
            }
            
            if (!projects || projects.length === 0) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "Nenhum projeto encontrado na conta."
                    }]
                };
            }

            const allModels: any[] = [];

            // 2. Para cada projeto, buscar modelos BIM
            for (const project of projects) {
                const projectId = project.id?.replace(/^b\./, '') || project.id;
                const projectName = project.name || project.attributes?.name || projectId;

                try {
                    // Para getProjectTopFolders, precisamos do accountId com prefixo "b." ou URN
                    // E o projectId pode precisar ter o prefixo "b." também
                    let projectIdForDM = projectId;
                    if (!projectId.startsWith('b.') && !projectId.startsWith('urn:')) {
                        projectIdForDM = `b.${projectId}`;
                    }

                    // Buscar pastas principais do projeto
                    const topFolders = await dataManagementClient.getProjectTopFolders(accountIdForHub, projectIdForDM, { accessToken });
                    
                    if (topFolders.data) {
                        // Processar cada pasta principal
                        for (const folder of topFolders.data) {
                            if (folder.type === 'folders' && folder.id) {
                                // Limitar busca a 1000 modelos por projeto para evitar loops infinitos
                                await searchFilesInFolder(
                                    dataManagementClient,
                                    projectIdForDM,
                                    folder.id,
                                    accessToken,
                                    allModels,
                                    projectName,
                                    1000
                                );
                            }
                        }
                    }
                } catch (error: any) {
                    // Se houver erro ao processar um projeto, continuar com o próximo
                    console.error(`Error processing project ${projectName}:`, error.message);
                }
            }

            // 3. Preparar resposta em formato JSON simples para processamento no n8n
            // Normalizar e limpar os dados antes de retornar
            const responseData = {
                total: allModels.length,
                accountId: accountId,
                models: allModels.map(model => {
                    // Normalizar projectId (remover prefixo "b." se presente)
                    const cleanProjectId = (model.projectId || '').replace(/^b\./, '');
                    
                    return {
                        projectId: cleanProjectId,
                        projectName: model.projectName || '',
                        fileName: model.fileName || '',
                        fileType: model.fileType || '',
                        itemId: model.itemId || '',
                        versionId: model.versionId || '',
                        versionNumber: model.versionNumber || 0,
                        fileSize: model.fileSize || 0,
                        fileSizeMB: model.fileSize > 0 ? parseFloat((model.fileSize / 1024 / 1024).toFixed(2)) : 0,
                        createTime: model.createTime || '',
                        createUserName: model.createUserName || '',
                        displayName: model.displayName || model.fileName || '',
                        urn: model.urn || '',
                        // Links formatados
                        viewInACC: model.links?.viewInACC || '',
                        viewerUrl: model.links?.viewerUrl || '',
                        downloadUrl: model.links?.downloadUrl || ''
                    };
                })
            };

            // 4. Retornar resultados - JSON puro sem markdown para facilitar processamento no n8n
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(responseData)
                }]
            };
        } catch (error: any) {
            throw new Error(`Erro ao buscar modelos BIM: ${error.message}`);
        }
    }
};

