// n8n Code Node - Processar resposta da tool get-all-bim-models
// VERSÃO COM DEBUG - Use esta para identificar o problema

const input = items[0].json;

// ===== DEBUG: Ver estrutura completa =====
console.log("=== ESTRUTURA COMPLETA RECEBIDA ===");
console.log(JSON.stringify(input, null, 2));

// ===== 1. PROCURAR DADOS =====
let data = null;

// Tentativa 1: input.result.content[0].text (formato MCP padrão)
if (input.result?.content?.[0]?.text) {
    console.log("=== ENCONTROU EM input.result.content[0].text ===");
    try {
        const jsonText = input.result.content[0].text;
        console.log("Texto encontrado (primeiros 500 chars):", jsonText.substring(0, 500));
        data = JSON.parse(jsonText);
        console.log("JSON parseado com sucesso!");
    } catch (e) {
        console.error("Erro ao parsear:", e.message);
    }
}

// Tentativa 2: input.result.content[1].text (segundo bloco)
if (!data && input.result?.content?.[1]?.text) {
    console.log("=== ENCONTROU EM input.result.content[1].text ===");
    try {
        const jsonText = input.result.content[1].text;
        console.log("Texto encontrado (primeiros 500 chars):", jsonText.substring(0, 500));
        data = JSON.parse(jsonText);
        console.log("JSON parseado com sucesso!");
    } catch (e) {
        console.error("Erro ao parsear:", e.message);
    }
}

// Tentativa 3: input.result já contém os dados
if (!data && input.result) {
    if (input.result.models) {
        console.log("=== ENCONTROU EM input.result.models ===");
        data = input.result;
    } else if (input.result.total !== undefined) {
        console.log("=== ENCONTROU EM input.result (total) ===");
        data = input.result;
    }
}

// Tentativa 4: Procurar em todos os blocos de content
if (!data && input.result?.content) {
    console.log("=== PROCURANDO EM TODOS OS BLOCOS DE CONTENT ===");
    for (let i = 0; i < input.result.content.length; i++) {
        const block = input.result.content[i];
        console.log(`Bloco ${i}:`, block.type, block.text ? "tem texto" : "sem texto");
        if (block.type === "text" && block.text) {
            try {
                const parsed = JSON.parse(block.text);
                if (parsed.models || parsed.total !== undefined) {
                    console.log(`=== ENCONTROU DADOS NO BLOCO ${i} ===`);
                    data = parsed;
                    break;
                }
            } catch (e) {
                console.log(`Bloco ${i}: não é JSON válido`);
            }
        }
    }
}

// ===== 2. VALIDAR DADOS =====
if (!data) {
    console.error("=== ERRO: DADOS NÃO ENCONTRADOS ===");
    console.error("Estrutura completa:", JSON.stringify(input, null, 2));
    throw new Error("Não foi possível encontrar dados de modelos BIM. Verifique os logs acima para ver a estrutura recebida.");
}

console.log("=== DADOS ENCONTRADOS ===");
console.log("Total de modelos:", data.total || data.models?.length || 0);
console.log("Primeiro modelo (amostra):", JSON.stringify(data.models?.[0], null, 2).substring(0, 500));

// ===== 3. EXTRAIR MODELOS =====
const models = Array.isArray(data.models) ? data.models : [];

if (models.length === 0) {
    return [{
        json: {
            message: "Nenhum modelo BIM encontrado",
            total: 0,
            accountId: data.accountId || ''
        }
    }];
}

// ===== 4. TRANSFORMAR EM TABELA =====
const tabela = models.map((modelo, index) => {
    // Formatar fileSize
    let fileSizeMB = modelo.fileSizeMB || 0;
    if (!fileSizeMB && modelo.fileSize) {
        fileSizeMB = parseFloat((modelo.fileSize / 1024 / 1024).toFixed(2));
    }
    
    // Formatar data
    let createdAt = modelo.createTime || '';
    if (createdAt) {
        try {
            const date = new Date(createdAt);
            createdAt = date.toLocaleString('pt-BR');
        } catch (e) {
            // Manter original
        }
    }
    
    // Extrair links
    const viewInACC = modelo.viewInACC || modelo.links?.viewInACC || '';
    const viewerUrl = modelo.viewerUrl || modelo.links?.viewerUrl || '';
    const downloadUrl = modelo.downloadUrl || modelo.links?.downloadUrl || '';
    
    return {
        Project_Name: modelo.projectName || '',
        File_Name: modelo.fileName || '',
        File_Type: modelo.fileType || '',
        Version: modelo.versionNumber || 0,
        File_Size_MB: fileSizeMB > 0 ? fileSizeMB.toFixed(2) : '0',
        File_Size_Bytes: modelo.fileSize || 0,
        Created_By: modelo.createUserName || '',
        Created_At: createdAt,
        View_in_ACC: viewInACC,
        Viewer_URL: viewerUrl,
        Download_URL: downloadUrl,
        Project_ID: modelo.projectId || '',
        Item_ID: modelo.itemId || '',
        Version_ID: modelo.versionId || '',
        URN: modelo.urn || '',
        Display_Name: modelo.displayName || modelo.fileName || ''
    };
});

console.log(`=== TABELA CRIADA: ${tabela.length} itens ===`);

// ===== 5. RETORNAR RESULTADOS =====
return tabela.map(row => ({ json: row }));

