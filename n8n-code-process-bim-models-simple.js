// n8n Code Node - Processar resposta da tool get-all-bim-models
// VERSÃO SIMPLIFICADA - Use esta versão se a anterior não funcionar

const input = items[0].json;

// Debug: ver estrutura completa (remover depois)
console.log("=== ESTRUTURA RECEBIDA ===");
console.log(JSON.stringify(input, null, 2).substring(0, 2000));

// 1. Extrair JSON da resposta
let jsonText = null;

// Procurar em input.result.content[0].text (formato MCP padrão)
if (input.result?.content?.[0]?.text) {
    jsonText = input.result.content[0].text;
}
// Procurar em input.result.content[1].text (segundo bloco)
else if (input.result?.content?.[1]?.text) {
    jsonText = input.result.content[1].text;
}
// Procurar em outros lugares
else if (input.result?.text) {
    jsonText = input.result.text;
}
else if (input.text) {
    jsonText = input.text;
}
else if (input.output) {
    jsonText = input.output;
}
else if (input.response) {
    jsonText = input.response;
}

// 2. Se não encontrou texto, verificar se já é objeto
let data = null;
if (!jsonText) {
    // Tentar usar input.result diretamente se contém models
    if (input.result?.models) {
        data = input.result;
    }
    // Tentar usar input diretamente se contém models
    else if (input.models) {
        data = input;
    }
}

// 3. Parsear JSON se necessário
if (jsonText && !data) {
    try {
        // Limpar markdown se existir
        const cleaned = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        data = JSON.parse(cleaned);
    } catch (err) {
        // Tentar extrair JSON do texto
        try {
            const jsonMatch = jsonText.match(/\{[\s\S]*"models"[\s\S]*\}/);
            if (jsonMatch) {
                data = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error(`Erro ao parsear JSON: ${err.message}`);
            }
        } catch (parseErr) {
            throw new Error(`Erro ao processar resposta: ${parseErr.message}. Estrutura: ${JSON.stringify(input, null, 2).substring(0, 500)}`);
        }
    }
}

// 4. Validar dados
if (!data) {
    throw new Error(`Dados não encontrados. Estrutura recebida: ${JSON.stringify(input, null, 2).substring(0, 1000)}`);
}

// 5. Extrair modelos
const models = data.models || [];

if (models.length === 0) {
    return [{
        json: {
            message: "Nenhum modelo BIM encontrado",
            total: 0
        }
    }];
}

// 6. Transformar em tabela
const tabela = models.map(modelo => ({
    Project_Name: modelo.projectName || '',
    File_Name: modelo.fileName || '',
    File_Type: modelo.fileType || '',
    Version: modelo.versionNumber || 0,
    File_Size: modelo.fileSizeMB ? `${modelo.fileSizeMB.toFixed(2)} MB` : (modelo.fileSize ? `${(modelo.fileSize / 1024 / 1024).toFixed(2)} MB` : 'N/A'),
    Created_By: modelo.createUserName || '',
    Created_At: modelo.createTime || '',
    View_in_ACC: modelo.viewInACC || modelo.links?.viewInACC || '',
    Viewer_URL: modelo.viewerUrl || modelo.links?.viewerUrl || ''
}));

// 7. Retornar múltiplos itens
return tabela.map(row => ({ json: row }));

