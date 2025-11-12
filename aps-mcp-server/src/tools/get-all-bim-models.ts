import { z } from "zod";
import { DataManagementClient } from "@aps_sdk/data-management";
import { getAccessToken, cleanAccountId } from "./common.js";
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
    projectName: string
): Promise<void> {
    try {
        // Buscar conteúdo da pasta
        const contents = await dataManagementClient.getFolderContents(projectId, folderId, { accessToken });
        
        if (!contents.data) {
            return;
        }

        // Processar cada item na pasta
        for (const item of contents.data) {
            if (item.type === 'folders') {
                // Se for uma pasta, buscar recursivamente
                const subFolderId = item.id;
                if (subFolderId) {
                    await searchFilesInFolder(dataManagementClient, projectId, subFolderId, accessToken, models, projectName);
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

                                // Tentar obter tamanho do arquivo de versionData (pode estar em diferentes lugares)
                                if (versionData.attributes?.storage) {
                                    modelInfo.fileSize = versionData.attributes.storage.size || 0;
                                    modelInfo.storageLocation = versionData.attributes.storage.location || '';
                                } else if (storageData) {
                                    // Tentar obter tamanho do storage data
                                    modelInfo.fileSize = (storageData as any).size || 0;
                                    modelInfo.storageLocation = (storageData as any).location || '';
                                }

                                // Construir links úteis
                                const links: any = {
                                    viewInACC: `https://acc.autodesk.com/projects/${projectId}/folders/${folderId}/items/${item.id}`,
                                    itemId: item.id,
                                    versionId: version.id
                                };

                                // Se tiver URN, adicionar link para visualização no Viewer
                                if (modelInfo.urn) {
                                    // Codificar URN para URL (base64url)
                                    try {
                                        const urnBase64 = Buffer.from(modelInfo.urn).toString('base64')
                                            .replace(/\+/g, '-')
                                            .replace(/\//g, '_')
                                            .replace(/=/g, '');
                                        links.viewerUrl = `https://aps.autodesk.com/viewer?urn=${urnBase64}`;
                                    } catch (e) {
                                        // Se falhar a codificação, usar URN direto
                                        links.viewerUrl = `https://aps.autodesk.com/viewer?urn=${encodeURIComponent(modelInfo.urn)}`;
                                    }
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
            
            // Limpar accountId
            const accountIdClean = cleanAccountId(accountId);
            
            // 1. Listar todos os projetos da conta
            const projects = await dataManagementClient.getHubProjects(accountIdClean, { accessToken });
            
            if (!projects.data || projects.data.length === 0) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "Nenhum projeto encontrado na conta."
                    }]
                };
            }

            const allModels: any[] = [];

            // 2. Para cada projeto, buscar modelos BIM
            for (const project of projects.data) {
                const projectId = project.id;
                const projectName = project.attributes?.name || projectId;

                try {
                    // Buscar pastas principais do projeto
                    const topFolders = await dataManagementClient.getProjectTopFolders(accountIdClean, projectId, { accessToken });
                    
                    if (topFolders.data) {
                        // Processar cada pasta principal
                        for (const folder of topFolders.data) {
                            if (folder.type === 'folders' && folder.id) {
                                await searchFilesInFolder(
                                    dataManagementClient,
                                    projectId,
                                    folder.id,
                                    accessToken,
                                    allModels,
                                    projectName
                                );
                            }
                        }
                    }
                } catch (error: any) {
                    // Se houver erro ao processar um projeto, continuar com o próximo
                    console.error(`Error processing project ${projectName}:`, error.message);
                }
            }

            // 3. Formatar resultados em tabela
            const tableOutput = formatModelsAsTable(allModels);

            // 4. Retornar resultados
            return {
                content: [{
                    type: "text" as const,
                    text: tableOutput
                }, {
                    type: "text" as const,
                    text: JSON.stringify({
                        total: allModels.length,
                        models: allModels
                    }, null, 2)
                }]
            };
        } catch (error: any) {
            throw new Error(`Erro ao buscar modelos BIM: ${error.message}`);
        }
    }
};

