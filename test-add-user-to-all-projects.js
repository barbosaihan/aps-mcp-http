// Script para adicionar Service Account a todos os projetos de uma conta
// Execute: node test-add-user-to-all-projects.js <accountId> [email]
// Se email não for fornecido, usa APS_SA_EMAIL do .env automaticamente
// Example: node test-add-user-to-all-projects.js 894931ce-9674-44a2-bad9-810338325031
// Example: node test-add-user-to-all-projects.js 894931ce-9674-44a2-bad9-810338325031 usuario@example.com

// O .env será carregado automaticamente pelo módulo config.js da tool compilada

async function main() {
    // Importar as tools compiladas e config para pegar APS_SA_EMAIL
    const { adminGetAccountProjects } = await import('./aps-mcp-server/build/tools/admin-get-account-projects.js');
    const { adminAddProjectUser } = await import('./aps-mcp-server/build/tools/admin-add-project-user.js');
    const { APS_SA_EMAIL } = await import('./aps-mcp-server/build/config.js');
    
    const accountId = process.argv[2];
    const userEmail = process.argv[3] || APS_SA_EMAIL;

    if (!accountId) {
        console.error('\n❌ Erro: accountId é obrigatório\n');
        console.error('Usage: node test-add-user-to-all-projects.js <accountId> [email]');
        console.error('\nExamples:');
        console.error('  node test-add-user-to-all-projects.js 894931ce-9674-44a2-bad9-810338325031');
        console.error('  # (usa APS_SA_EMAIL do .env automaticamente)');
        console.error('  node test-add-user-to-all-projects.js 894931ce-9674-44a2-bad9-810338325031 usuario@example.com\n');
        process.exit(1);
    }
    
    if (!userEmail) {
        console.error('\n❌ Erro: Email não fornecido e APS_SA_EMAIL não está configurado no .env\n');
        process.exit(1);
    }

    console.log('\n' + '='.repeat(70));
    console.log('🚀 Adicionando usuário a todos os projetos da conta');
    console.log('='.repeat(70));
    console.log(`\n📋 Parâmetros:`);
    console.log(`   Account ID: ${accountId}`);
    console.log(`   User Email: ${userEmail}`);
    if (!process.argv[3] && APS_SA_EMAIL) {
        console.log(`   ℹ️  (Email obtido automaticamente do .env - APS_SA_EMAIL)`);
    }
    console.log('\n🔄 Iniciando processo...\n');

    try {
        // 1. Listar todos os projetos da conta
        console.log('📞 Listando projetos da conta...');
        const projectsResult = await adminGetAccountProjects.callback({ accountId });
        
        if (!projectsResult.content || projectsResult.content.length === 0) {
            console.log('\n⚠️  Nenhum projeto encontrado na conta.');
            process.exit(0);
        }
        
        // Parse dos projetos
        const projects = projectsResult.content.map(item => {
            try {
                return JSON.parse(item.text);
            } catch {
                return null;
            }
        }).filter(Boolean);
        
        console.log(`✅ Encontrados ${projects.length} projeto(s) na conta\n`);
        
        // 2. Adicionar usuário a cada projeto
        const results = {
            success: [],
            failed: [],
            skipped: []
        };
        
        for (let i = 0; i < projects.length; i++) {
            const project = projects[i];
            const projectId = project.id?.replace(/^b\./, '') || project.id;
            const projectName = project.name || project.attributes?.name || projectId;
            
            console.log(`[${i + 1}/${projects.length}] Processando projeto: ${projectName} (${projectId})`);
            
            try {
                const addUserResult = await adminAddProjectUser.callback({
                    projectId: projectId,
                    email: userEmail,
                    products: [] // Array vazio para dar acesso a todos os produtos
                });
                
                if (addUserResult.content && addUserResult.content.length > 0) {
                    try {
                        const userData = JSON.parse(addUserResult.content[0].text);
                        console.log(`   ✅ Usuário adicionado com sucesso! ID: ${userData.id || 'N/A'}`);
                        results.success.push({
                            projectId,
                            projectName,
                            userData
                        });
                    } catch {
                        console.log(`   ✅ Usuário adicionado com sucesso!`);
                        results.success.push({
                            projectId,
                            projectName
                        });
                    }
                } else {
                    console.log(`   ⚠️  Resposta vazia, mas sem erro`);
                    results.success.push({
                        projectId,
                        projectName
                    });
                }
            } catch (error) {
                const errorMessage = error?.message || error?.toString() || "Unknown error";
                
                // Se o erro indicar que o usuário já está no projeto, pular
                if (errorMessage.includes("already") || errorMessage.includes("exists") || 
                    errorMessage.includes("409") || errorMessage.includes("duplicate")) {
                    console.log(`   ⏭️  Usuário já está no projeto (pulando)`);
                    results.skipped.push({
                        projectId,
                        projectName,
                        reason: "User already in project"
                    });
                } else {
                    console.log(`   ❌ Erro: ${errorMessage.substring(0, 100)}`);
                    results.failed.push({
                        projectId,
                        projectName,
                        error: errorMessage
                    });
                }
            }
            
            // Pequeno delay para evitar rate limiting
            if (i < projects.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // 3. Exibir resumo
        console.log('\n' + '='.repeat(70));
        console.log('📊 RESUMO');
        console.log('='.repeat(70));
        console.log(`\n✅ Sucesso: ${results.success.length}`);
        console.log(`⏭️  Pulados (já estava no projeto): ${results.skipped.length}`);
        console.log(`❌ Falhas: ${results.failed.length}`);
        console.log(`📁 Total de projetos: ${projects.length}`);
        
        if (results.success.length > 0) {
            console.log('\n✅ Projetos onde o usuário foi adicionado:');
            results.success.forEach((item, index) => {
                console.log(`   ${index + 1}. ${item.projectName} (${item.projectId})`);
            });
        }
        
        if (results.skipped.length > 0) {
            console.log('\n⏭️  Projetos pulados (usuário já estava no projeto):');
            results.skipped.forEach((item, index) => {
                console.log(`   ${index + 1}. ${item.projectName} (${item.projectId})`);
            });
        }
        
        if (results.failed.length > 0) {
            console.log('\n❌ Projetos com erro:');
            results.failed.forEach((item, index) => {
                console.log(`   ${index + 1}. ${item.projectName} (${item.projectId})`);
                console.log(`      Erro: ${item.error.substring(0, 150)}`);
            });
        }
        
        console.log('\n' + '='.repeat(70));
        
        if (results.failed.length === 0) {
            console.log('✅ Teste concluído com sucesso!');
            console.log('='.repeat(70) + '\n');
            process.exit(0);
        } else {
            console.log('⚠️  Teste concluído com alguns erros');
            console.log('='.repeat(70) + '\n');
            process.exit(1);
        }
        
    } catch (error) {
        console.log('\n' + '='.repeat(70));
        console.log('❌ ERRO - Falha ao processar');
        console.log('='.repeat(70));
        
        console.error('\n📛 Mensagem de erro:');
        console.error(`   ${error.message || 'Erro desconhecido'}`);
        
        if (error.stack) {
            console.error('\n📄 Stack trace:');
            console.error(error.stack);
        }
        
        console.error('\n' + '='.repeat(70));
        console.error('❌ Teste falhou');
        console.error('='.repeat(70) + '\n');
        
        process.exit(1);
    }
}

// Executar função principal
main().catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
});
