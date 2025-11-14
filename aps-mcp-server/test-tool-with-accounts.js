// Script de teste para get-all-bim-models
// Primeiro lista as contas disponíveis, depois testa com a primeira conta

import { getAccounts } from './build/tools/get-accounts.js';
import { getAllBimModels } from './build/tools/get-all-bim-models.js';

console.log('\n=== 1. Listando contas disponíveis ===\n');

try {
    // Primeiro, listar contas disponíveis
    const accountsResult = await getAccounts.callback({});
    
    if (!accountsResult.content || accountsResult.content.length === 0) {
        console.log('Nenhuma conta encontrada.');
        process.exit(1);
    }
    
    const accounts = accountsResult.content.map(item => JSON.parse(item.text));
    console.log(`Encontradas ${accounts.length} conta(s):\n`);
    
    accounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.name || 'N/A'} (ID: ${account.id})`);
    });
    
    // Pegar a primeira conta
    const firstAccount = accounts[0];
    const accountId = firstAccount.id;
    
    console.log(`\n=== 2. Testando get-all-bim-models com accountId: ${accountId} ===\n`);
    console.log('Chamando a tool...\n');
    
    const result = await getAllBimModels.callback({ accountId });
    
    console.log('=== RESULTADO ===\n');
    
    if (result.content && result.content.length > 0) {
        // Parse do JSON retornado
        const content = result.content[0].text;
        const data = JSON.parse(content);
        
        console.log(`Total de modelos encontrados: ${data.total || 0}`);
        console.log(`Account ID: ${data.accountId || accountId}`);
        
        if (data.models && data.models.length > 0) {
            console.log(`\n=== Primeiros 5 modelos ===\n`);
            
            // Mostrar os primeiros 5 modelos
            const firstModels = data.models.slice(0, 5);
            
            firstModels.forEach((model, index) => {
                console.log(`\n--- Modelo ${index + 1} ---`);
                console.log(`Project Name: ${model.projectName || 'N/A'}`);
                console.log(`File Name: ${model.fileName || 'N/A'}`);
                console.log(`File Type: ${model.fileType || 'N/A'}`);
                console.log(`File Size: ${model.fileSize || 0} bytes`);
                console.log(`File Size MB: ${model.fileSizeMB || 0} MB`);
                console.log(`Viewer URL: ${model.viewerUrl || 'N/A'}`);
                console.log(`View in ACC: ${model.viewInACC || 'N/A'}`);
                console.log(`URN: ${model.urn ? (model.urn.substring(0, 50) + '...') : 'N/A'}`);
                console.log(`Created At: ${model.createTime || 'N/A'}`);
                console.log(`Created By: ${model.createUserName || 'N/A'}`);
            });
            
            console.log(`\n\n=== ESTATÍSTICAS GERAIS ===\n`);
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
            console.log(`  ✅ Com tamanho: ${modelsWithSize.length} (${((modelsWithSize.length / data.models.length) * 100).toFixed(1)}%)`);
            console.log(`  ❌ Sem tamanho: ${modelsWithoutSize.length} (${((modelsWithoutSize.length / data.models.length) * 100).toFixed(1)}%)`);
            
            // Estatísticas de viewerUrl
            const modelsWithViewerUrl = data.models.filter(m => m.viewerUrl && m.viewerUrl !== '');
            const modelsWithoutViewerUrl = data.models.filter(m => !m.viewerUrl || m.viewerUrl === '');
            console.log(`\nViewer URL:`);
            console.log(`  ✅ Com URL: ${modelsWithViewerUrl.length} (${((modelsWithViewerUrl.length / data.models.length) * 100).toFixed(1)}%)`);
            console.log(`  ❌ Sem URL: ${modelsWithoutViewerUrl.length} (${((modelsWithoutViewerUrl.length / data.models.length) * 100).toFixed(1)}%)`);
            
            // Verificar se há URNs
            const modelsWithURN = data.models.filter(m => m.urn && m.urn.startsWith('urn:'));
            const modelsWithoutURN = data.models.filter(m => !m.urn || !m.urn.startsWith('urn:'));
            console.log(`\nURN:`);
            console.log(`  ✅ Com URN: ${modelsWithURN.length} (${((modelsWithURN.length / data.models.length) * 100).toFixed(1)}%)`);
            console.log(`  ❌ Sem URN: ${modelsWithoutURN.length} (${((modelsWithoutURN.length / data.models.length) * 100).toFixed(1)}%)`);
            
            // Mostrar alguns exemplos de viewerUrl que funcionam
            if (modelsWithViewerUrl.length > 0) {
                console.log(`\n\n=== Exemplos de Viewer URLs (funcionando) ===\n`);
                modelsWithViewerUrl.slice(0, 3).forEach((model, index) => {
                    console.log(`${index + 1}. ${model.fileName}`);
                    console.log(`   URL: ${model.viewerUrl}`);
                    console.log(`   URN: ${model.urn ? (model.urn.substring(0, 60) + '...') : 'N/A'}`);
                });
            }
            
            // Mostrar alguns exemplos de fileSize que funcionam
            if (modelsWithSize.length > 0) {
                console.log(`\n\n=== Exemplos de File Sizes (funcionando) ===\n`);
                modelsWithSize.slice(0, 3).forEach((model, index) => {
                    console.log(`${index + 1}. ${model.fileName}`);
                    console.log(`   Size: ${model.fileSize} bytes (${model.fileSizeMB} MB)`);
                });
            }
            
            // Mostrar modelos sem fileSize para debug (apenas alguns)
            if (modelsWithoutSize.length > 0) {
                console.log(`\n\n=== Modelos sem File Size (primeiros 5 para debug) ===\n`);
                modelsWithoutSize.slice(0, 5).forEach((model, index) => {
                    console.log(`${index + 1}. ${model.fileName} (${model.fileType})`);
                });
            }
            
            // Mostrar modelos sem viewerUrl para debug (apenas alguns)
            if (modelsWithoutViewerUrl.length > 0) {
                console.log(`\n\n=== Modelos sem Viewer URL (primeiros 5 para debug) ===\n`);
                modelsWithoutViewerUrl.slice(0, 5).forEach((model, index) => {
                    console.log(`${index + 1}. ${model.fileName} (${model.fileType})`);
                    console.log(`   URN: ${model.urn || 'N/A'}`);
                    console.log(`   View in ACC: ${model.viewInACC || 'N/A'}`);
                });
            }
        } else {
            console.log('Nenhum modelo encontrado nesta conta.');
        }
    } else {
        console.log('Nenhum conteúdo retornado.');
    }
    
} catch (error) {
    console.error('\n=== ERRO ===\n');
    console.error('Mensagem:', error.message);
    if (error.stack) {
        console.error('\nStack:', error.stack);
    }
    process.exit(1);
}

