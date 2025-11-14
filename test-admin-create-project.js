// Script de teste para admin-create-project
// Execute: node test-admin-create-project.js <accountId> <projectName> [projectType]
// Example: node test-admin-create-project.js 894931ce-9674-44a2-bad9-810338325031 "Meu Projeto Teste" "Commercial"

// O .env será carregado automaticamente pelo módulo config.js da tool compilada

// Importar a tool compilada
const { adminCreateProject } = await import('./aps-mcp-server/build/tools/admin-create-project.js');

const accountId = process.argv[2];
const projectName = process.argv[3];
const projectType = process.argv[4] || 'Commercial';

if (!accountId || !projectName) {
    console.error('\n❌ Erro: Argumentos insuficientes\n');
    console.error('Usage: node test-admin-create-project.js <accountId> <projectName> [projectType]');
    console.error('\nExample:');
    console.error('  node test-admin-create-project.js 894931ce-9674-44a2-bad9-810338325031 "Meu Projeto Teste"');
    console.error('  node test-admin-create-project.js 894931ce-9674-44a2-bad9-810338325031 "Meu Projeto Teste" "Commercial"\n');
    process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('🧪 Testando admin-create-project');
console.log('='.repeat(70));
console.log(`\n📋 Parâmetros:`);
console.log(`   Account ID: ${accountId}`);
console.log(`   Project Name: ${projectName}`);
console.log(`   Project Type: ${projectType}`);
console.log('\n🔄 Iniciando teste...\n');

try {
    console.log('📞 Chamando a tool...');
    
    const result = await adminCreateProject.callback({
        accountId,
        name: projectName,
        type: projectType
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ SUCESSO - Projeto criado!');
    console.log('='.repeat(70));
    
    if (result.content && result.content.length > 0) {
        try {
            // Parse do JSON retornado
            const content = result.content[0].text;
            const data = JSON.parse(content);
            
            console.log('\n📊 Detalhes do projeto criado:\n');
            console.log(`   ID: ${data.id || 'N/A'}`);
            console.log(`   Nome: ${data.name || projectName}`);
            console.log(`   Account ID: ${data.accountId || accountId}`);
            console.log(`   Tipo: ${data.type || projectType}`);
            
            if (data.serviceTypes) {
                console.log(`   Service Types: ${Array.isArray(data.serviceTypes) ? data.serviceTypes.join(', ') : data.serviceTypes}`);
            }
            
            if (data.status) {
                console.log(`   Status: ${data.status}`);
            }
            
            if (data.createdAt) {
                console.log(`   Criado em: ${data.createdAt}`);
            }
            
            // Mostrar JSON completo formatado
            console.log('\n📄 JSON completo:');
            console.log(JSON.stringify(data, null, 2));
            
        } catch (parseError) {
            console.log('\n⚠️  Resultado (texto):');
            console.log(result.content[0].text);
        }
    } else {
        console.log('\n⚠️  Nenhum conteúdo retornado.');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Teste concluído com sucesso!');
    console.log('='.repeat(70) + '\n');
    
    process.exit(0);
    
} catch (error) {
    console.log('\n' + '='.repeat(70));
    console.log('❌ ERRO - Falha ao criar projeto');
    console.log('='.repeat(70));
    
    console.error('\n📛 Mensagem de erro:');
    console.error(`   ${error.message || 'Erro desconhecido'}`);
    
    // Tentar parsear erro JSON para exibir informações detalhadas
    try {
        let errorJson = JSON.parse(error.message);
        
        // Se a mensagem também é JSON (erro aninhado), tentar parsear
        if (typeof errorJson.message === 'string' && errorJson.message.startsWith('{')) {
            try {
                errorJson.message = JSON.parse(errorJson.message);
            } catch {
                // Manter mensagem original se não conseguir parsear
            }
        }
        
        console.error('\n📋 Detalhes do erro:');
        if (errorJson.statusCode) {
            console.error(`   Status Code: ${errorJson.statusCode}`);
        }
        if (errorJson.error) {
            console.error(`   Erro: ${errorJson.error}`);
        }
        if (errorJson.message) {
            let message = errorJson.message;
            if (typeof message === 'object') {
                message = message.message || JSON.stringify(message);
            }
            console.error(`   Mensagem: ${message}`);
        }
        
        if (errorJson.diagnostic) {
            console.error('\n🔍 Diagnóstico:');
            console.error(`   ${errorJson.diagnostic}`);
        }
        
        if (errorJson.possibleCauses && Array.isArray(errorJson.possibleCauses)) {
            console.error('\n💡 Possíveis causas:');
            errorJson.possibleCauses.forEach((cause, index) => {
                console.error(`   ${index + 1}. ${cause}`);
            });
        }
        
        if (errorJson.troubleshooting && Array.isArray(errorJson.troubleshooting)) {
            console.error('\n🔧 Sugestões de solução:');
            errorJson.troubleshooting.forEach((step, index) => {
                console.error(`   ${index + 1}. ${step}`);
            });
        }
        
        if (errorJson.suggestions && Array.isArray(errorJson.suggestions)) {
            console.error('\n💡 Sugestões:');
            errorJson.suggestions.forEach((suggestion, index) => {
                console.error(`   ${index + 1}. ${suggestion}`);
            });
        }
        
        if (errorJson.hint) {
            console.error('\n💡 Dica:');
            console.error(`   ${errorJson.hint}`);
        }
        
    } catch (parseError) {
        // Se não conseguir parsear, mostrar erro completo
        console.error('\n📄 Erro completo:');
        console.error(error.message);
        if (error.stack) {
            console.error('\n📄 Stack trace:');
            console.error(error.stack);
        }
    }
    
    console.error('\n' + '='.repeat(70));
    console.error('❌ Teste falhou');
    console.error('='.repeat(70) + '\n');
    
    process.exit(1);
}

