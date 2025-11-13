// Script de teste para get-all-bim-models
// Execute: node test-get-all-bim-models.js <accountId>

import { getAccessToken } from './aps-mcp-server/build/tools/common.js';
import { DataManagementClient } from '@aps_sdk/data-management';
import { buildApiUrl, fetchWithTimeout } from './aps-mcp-server/build/tools/common.js';

const accountId = process.argv[2];

if (!accountId) {
    console.error('Usage: node test-get-all-bim-models.js <accountId>');
    process.exit(1);
}

async function testGetAllBimModels() {
    try {
        const accessToken = await getAccessToken(["data:read", "account:read"]);
        console.log('Access token obtido com sucesso');
        
        // Listar projetos
        const projectsUrl = buildApiUrl(`construction/admin/v1/accounts/${accountId}/projects`);
        const projectsResponse = await fetchWithTimeout(projectsUrl, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        }, 30000, 0);
        
        if (!projectsResponse.ok) {
            throw new Error(`Erro ao buscar projetos: ${projectsResponse.status}`);
        }
        
        const projectsData = await projectsResponse.json();
        const projects = projectsData.results || projectsData.data || [];
        console.log(`Encontrados ${projects.length} projetos`);
        
        if (projects.length === 0) {
            console.log('Nenhum projeto encontrado');
            return;
        }
        
        // Pegar o primeiro projeto para teste
        const firstProject = projects[0];
        const projectId = firstProject.id || firstProject.projectId;
        const projectName = firstProject.name || firstProject.projectName || 'Unknown';
        console.log(`\nTestando com projeto: ${projectName} (${projectId})`);
        
        // Buscar versões de um item específico para ver a estrutura
        const dataManagementClient = new DataManagementClient();
        const topFolders = await dataManagementClient.getProjectTopFolders(accountId, projectId, { accessToken });
        
        if (!topFolders.data || topFolders.data.length === 0) {
            console.log('Nenhuma pasta encontrada no projeto');
            return;
        }
        
        const firstFolder = topFolders.data[0];
        console.log(`\nBuscando arquivos na pasta: ${firstFolder.id}`);
        
        const contents = await dataManagementClient.getFolderContents(projectId, firstFolder.id, { accessToken });
        
        if (!contents.data || contents.data.length === 0) {
            console.log('Nenhum arquivo encontrado na pasta');
            return;
        }
        
        // Encontrar um arquivo BIM
        const bimFile = contents.data.find(item => {
            if (item.type !== 'items') return false;
            const fileName = item.attributes?.displayName || '';
            return ['.dwg', '.rvt', '.ifc', '.nwd', '.nwf'].some(ext => 
                fileName.toLowerCase().endsWith(ext)
            );
        });
        
        if (!bimFile) {
            console.log('Nenhum arquivo BIM encontrado na pasta');
            return;
        }
        
        console.log(`\nArquivo BIM encontrado: ${bimFile.attributes?.displayName}`);
        console.log(`Item ID: ${bimFile.id}`);
        
        // Buscar versões
        const versions = await dataManagementClient.getItemVersions(projectId, bimFile.id, { accessToken });
        
        if (!versions.data || versions.data.length === 0) {
            console.log('Nenhuma versão encontrada');
            return;
        }
        
        const firstVersion = versions.data[0];
        console.log('\n=== ESTRUTURA DA VERSION ===');
        console.log(JSON.stringify({
            id: firstVersion.id,
            attributes: firstVersion.attributes,
            relationships: firstVersion.relationships
        }, null, 2));
        
        // Verificar fileSize
        const versionAttributes = firstVersion.attributes || {};
        const storageData = firstVersion.relationships?.storage?.data;
        const versionData = firstVersion;
        
        console.log('\n=== TENTANDO OBTER FILE SIZE ===');
        console.log('versionData.attributes?.storage?.size:', versionData.attributes?.storage?.size);
        console.log('versionAttributes.size:', (versionAttributes as any).size);
        console.log('storageData.size:', (storageData as any)?.size);
        console.log('item.attributes.size:', (bimFile.attributes as any)?.size);
        
        // Verificar URN
        console.log('\n=== TENTANDO OBTER URN ===');
        console.log('storageData.id:', storageData?.id);
        console.log('derivatives.id:', firstVersion.relationships?.derivatives?.data?.id);
        
    } catch (error) {
        console.error('Erro no teste:', error);
    }
}

testGetAllBimModels();

