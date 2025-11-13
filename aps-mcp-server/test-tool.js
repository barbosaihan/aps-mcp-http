// Script de teste para get-all-bim-models
// Execute: node test-tool.js <accountId>

import { getAllBimModels } from './build/tools/get-all-bim-models.js';

const accountId = process.argv[2];

if (!accountId) {
    console.error('Usage: node test-tool.js <accountId>');
    console.error('Example: node test-tool.js b.1234567890abcdef');
    process.exit(1);
}

console.log(`\n=== Testando get-all-bim-models com accountId: ${accountId} ===\n`);

try {
    console.log('Chamando a tool...\n');
    
    const result = await getAllBimModels.callback({ accountId });
    
    console.log('=== RESULTADO ===\n');
    
    if (result.content && result.content.length > 0) {
        // Parse do JSON retornado
        const content = result.content[0].text;
        const data = JSON.parse(content);
        
        console.log(`Total de modelos encontrados: ${data.total || 0}`);
        console.log(`Account ID: ${data.accountId || accountId}`);
        console.log(`\nPrimeiros 3 modelos:\n`);
        
        if (data.models && data.models.length > 0) {
            // Mostrar apenas os primeiros 3 modelos para não poluir o output
            const firstModels = data.models.slice(0, 3);
            
            firstModels.forEach((model, index) => {
                console.log(`\n--- Modelo ${index + 1} ---`);
                console.log(`Project Name: ${model.projectName || 'N/A'}`);
                console.log(`File Name: ${model.fileName || 'N/A'}`);
                console.log(`File Type: ${model.fileType || 'N/A'}`);
                console.log(`File Size: ${model.fileSize || 0} bytes`);
                console.log(`File Size MB: ${model.fileSizeMB || 0} MB`);
                console.log(`Viewer URL: ${model.viewerUrl || 'N/A'}`);
                console.log(`View in ACC: ${model.viewInACC || 'N/A'}`);
                console.log(`URN: ${model.urn || 'N/A'}`);
                console.log(`Created At: ${model.createTime || 'N/A'}`);
                console.log(`Created By: ${model.createUserName || 'N/A'}`);
            });
            
            console.log(`\n\n=== Estatísticas ===\n`);
            console.log(`Total de modelos: ${data.models.length}`);
            
            // Estatísticas por tipo de arquivo
            const typeStats = {};
            data.models.forEach(model => {
                const type = model.fileType || 'UNKNOWN';
                typeStats[type] = (typeStats[type] || 0) + 1;
            });
            console.log(`\nModelos por tipo:`);
            Object.entries(typeStats).forEach(([type, count]) => {
                console.log(`  ${type}: ${count}`);
            });
            
            // Estatísticas de fileSize
            const modelsWithSize = data.models.filter(m => m.fileSize && m.fileSize > 0);
            const modelsWithoutSize = data.models.filter(m => !m.fileSize || m.fileSize === 0);
            console.log(`\nFile Size:`);
            console.log(`  Com tamanho: ${modelsWithSize.length}`);
            console.log(`  Sem tamanho: ${modelsWithoutSize.length}`);
            
            // Estatísticas de viewerUrl
            const modelsWithViewerUrl = data.models.filter(m => m.viewerUrl && m.viewerUrl !== '');
            const modelsWithoutViewerUrl = data.models.filter(m => !m.viewerUrl || m.viewerUrl === '');
            console.log(`\nViewer URL:`);
            console.log(`  Com URL: ${modelsWithViewerUrl.length}`);
            console.log(`  Sem URL: ${modelsWithoutViewerUrl.length}`);
            
            // Verificar se há URNs
            const modelsWithURN = data.models.filter(m => m.urn && m.urn.startsWith('urn:'));
            const modelsWithoutURN = data.models.filter(m => !m.urn || !m.urn.startsWith('urn:'));
            console.log(`\nURN:`);
            console.log(`  Com URN: ${modelsWithURN.length}`);
            console.log(`  Sem URN: ${modelsWithoutURN.length}`);
            
            // Mostrar alguns exemplos de viewerUrl
            if (modelsWithViewerUrl.length > 0) {
                console.log(`\n\nExemplos de Viewer URLs:`);
                modelsWithViewerUrl.slice(0, 3).forEach((model, index) => {
                    console.log(`  ${index + 1}. ${model.fileName}: ${model.viewerUrl}`);
                });
            }
            
            // Mostrar alguns exemplos de fileSize
            if (modelsWithSize.length > 0) {
                console.log(`\n\nExemplos de File Sizes:`);
                modelsWithSize.slice(0, 3).forEach((model, index) => {
                    console.log(`  ${index + 1}. ${model.fileName}: ${model.fileSize} bytes (${model.fileSizeMB} MB)`);
                });
            }
            
            // Mostrar modelos sem fileSize para debug
            if (modelsWithoutSize.length > 0 && modelsWithoutSize.length <= 5) {
                console.log(`\n\nModelos sem File Size (para debug):`);
                modelsWithoutSize.forEach((model, index) => {
                    console.log(`  ${index + 1}. ${model.fileName} (${model.fileType})`);
                });
            }
            
            // Mostrar modelos sem viewerUrl para debug
            if (modelsWithoutViewerUrl.length > 0 && modelsWithoutViewerUrl.length <= 5) {
                console.log(`\n\nModelos sem Viewer URL (para debug):`);
                modelsWithoutViewerUrl.forEach((model, index) => {
                    console.log(`  ${index + 1}. ${model.fileName} (${model.fileType}) - URN: ${model.urn || 'N/A'}`);
                });
            }
        } else {
            console.log('Nenhum modelo encontrado.');
        }
    } else {
        console.log('Nenhum conteúdo retornado.');
    }
    
} catch (error) {
    console.error('\n=== ERRO ===\n');
    console.error('Mensagem:', error.message);
    if (error.stack) {
        console.error('Stack:', error.stack);
    }
    process.exit(1);
}

