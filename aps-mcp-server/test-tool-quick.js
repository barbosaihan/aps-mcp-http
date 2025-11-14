// Script de teste rápido para get-all-bim-models
// Limita a busca para não demorar muito

import { getAccounts } from './build/tools/get-accounts.js';
import { getAllBimModels } from './build/tools/get-all-bim-models.js';

console.log('\n=== Teste Rápido: get-all-bim-models ===\n');

try {
    // Listar contas disponíveis
    console.log('1. Listando contas disponíveis...');
    const accountsResult = await getAccounts.callback({});
    
    if (!accountsResult.content || accountsResult.content.length === 0) {
        console.log('Nenhuma conta encontrada.');
        process.exit(1);
    }
    
    const accounts = accountsResult.content.map(item => JSON.parse(item.text));
    const firstAccount = accounts[0];
    const accountId = firstAccount.id;
    
    console.log(`   ✓ Conta encontrada: ${firstAccount.name || 'N/A'} (${accountId})\n`);
    
    // Testar a tool
    console.log('2. Buscando modelos BIM (limitado a 1000 modelos)...');
    console.log('   Isso pode levar alguns minutos...\n');
    
    const startTime = Date.now();
    const result = await getAllBimModels.callback({ accountId });
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`   ✓ Busca concluída em ${duration} segundos\n`);
    
    // Parse do resultado
    const content = result.content[0].text;
    const data = JSON.parse(content);
    
    console.log('=== RESULTADOS ===\n');
    console.log(`Total de modelos encontrados: ${data.total || 0}`);
    console.log(`Account ID: ${data.accountId || accountId}\n`);
    
    if (data.models && data.models.length > 0) {
        // Estatísticas gerais
        const modelsWithSize = data.models.filter(m => m.fileSize && m.fileSize > 0);
        const modelsWithoutSize = data.models.filter(m => !m.fileSize || m.fileSize === 0);
        const modelsWithViewerUrl = data.models.filter(m => m.viewerUrl && m.viewerUrl !== '');
        const modelsWithoutViewerUrl = data.models.filter(m => !m.viewerUrl || m.viewerUrl === '');
        const modelsWithURN = data.models.filter(m => m.urn && m.urn.startsWith('urn:'));
        
        console.log('=== ESTATÍSTICAS ===\n');
        console.log(`File Size:`);
        console.log(`  ✅ Com tamanho: ${modelsWithSize.length} (${((modelsWithSize.length / data.models.length) * 100).toFixed(1)}%)`);
        console.log(`  ❌ Sem tamanho: ${modelsWithoutSize.length} (${((modelsWithoutSize.length / data.models.length) * 100).toFixed(1)}%)`);
        console.log(`\nViewer URL:`);
        console.log(`  ✅ Com URL: ${modelsWithViewerUrl.length} (${((modelsWithViewerUrl.length / data.models.length) * 100).toFixed(1)}%)`);
        console.log(`  ❌ Sem URL: ${modelsWithoutViewerUrl.length} (${((modelsWithoutViewerUrl.length / data.models.length) * 100).toFixed(1)}%)`);
        console.log(`\nURN:`);
        console.log(`  ✅ Com URN: ${modelsWithURN.length} (${((modelsWithURN.length / data.models.length) * 100).toFixed(1)}%)`);
        console.log(`  ❌ Sem URN: ${data.models.length - modelsWithURN.length} (${(((data.models.length - modelsWithURN.length) / data.models.length) * 100).toFixed(1)}%)\n`);
        
        // Mostrar primeiros 3 modelos
        console.log('=== PRIMEIROS 3 MODELOS ===\n');
        data.models.slice(0, 3).forEach((model, index) => {
            console.log(`${index + 1}. ${model.fileName || 'N/A'}`);
            console.log(`   Project: ${model.projectName || 'N/A'}`);
            console.log(`   Type: ${model.fileType || 'N/A'}`);
            console.log(`   Size: ${model.fileSizeMB || 0} MB (${model.fileSize || 0} bytes)`);
            console.log(`   Viewer URL: ${model.viewerUrl ? '✅ Sim' : '❌ Não'}`);
            if (model.viewerUrl) {
                console.log(`   URL: ${model.viewerUrl.substring(0, 60)}...`);
            }
            console.log(`   URN: ${model.urn ? '✅ Sim' : '❌ Não'}`);
            if (model.urn) {
                console.log(`   URN: ${model.urn.substring(0, 50)}...`);
            }
            console.log('');
        });
        
        // Mostrar exemplos de fileSize funcionando
        if (modelsWithSize.length > 0) {
            console.log('=== EXEMPLOS DE FILE SIZE (funcionando) ===\n');
            modelsWithSize.slice(0, 3).forEach((model, index) => {
                console.log(`${index + 1}. ${model.fileName}: ${model.fileSizeMB} MB (${model.fileSize} bytes)`);
            });
            console.log('');
        }
        
        // Mostrar exemplos de viewerUrl funcionando
        if (modelsWithViewerUrl.length > 0) {
            console.log('=== EXEMPLOS DE VIEWER URL (funcionando) ===\n');
            modelsWithViewerUrl.slice(0, 3).forEach((model, index) => {
                console.log(`${index + 1}. ${model.fileName}`);
                console.log(`   URL: ${model.viewerUrl}`);
            });
            console.log('');
        }
        
        console.log('✅ Teste concluído com sucesso!');
    } else {
        console.log('Nenhum modelo encontrado.');
    }
    
    process.exit(0);
    
} catch (error) {
    console.error('\n❌ ERRO:\n');
    console.error('Mensagem:', error.message);
    if (error.stack) {
        console.error('\nStack:', error.stack);
    }
    process.exit(1);
}

