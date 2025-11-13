// n8n Code Node - Processar resposta da tool get-all-bim-models
// Versão melhorada para processar a resposta do MCP Server

const input = items[0].json;

// 1. Tentar encontrar o conteúdo da resposta em diferentes formatos
let jsonText = null;
let data = null;

// Verificar se já vem como objeto JSON parseado
if (input.result && typeof input.result === 'object') {
    // Se result.content existe e é um array
    if (input.result.content && Array.isArray(input.result.content)) {
        // Procurar o primeiro bloco de texto que contenha JSON
        for (const block of input.result.content) {
            if (block.type === "text" && block.text) {
                jsonText = block.text;
                break;
            }
        }
    }
    // Se result já contém models diretamente
    else if (input.result.models) {
        data = input.result;
    }
    // Se result já é o objeto de dados
    else if (input.result.total !== undefined) {
        data = input.result;
    }
}

// 2. Se não encontrou ainda, procurar em outros lugares
if (!jsonText && !data) {
    // Tentar encontrar em diferentes caminhos
    const possiblePaths = [
        input.result?.content?.[0]?.text,
        input.result?.content?.[1]?.text,
        input.content?.[0]?.text,
        input.content?.[1]?.text,
        input.text,
        input.output,
        input.response
    ];
    
    for (const path of possiblePaths) {
        if (path && typeof path === 'string') {
            // Verificar se contém JSON válido
            if (path.includes('"models"') || path.includes('"total"')) {
                jsonText = path;
                break;
            }
        }
    }
}

// 3. Limpar e parsear JSON se necessário
if (jsonText && !data) {
    // Remover markdown code blocks se existirem
    jsonText = jsonText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
    
    // Tentar fazer parse do JSON
    try {
        data = JSON.parse(jsonText);
    } catch (err) {
        // Se falhar, tentar extrair apenas o JSON do texto
        try {
            // Procurar por padrão JSON no texto
            const jsonMatch = jsonText.match(/\{[\s\S]*"models"[\s\S]*\}/);
            if (jsonMatch) {
                data = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error(`Não foi possível parsear o JSON: ${err.message}. Texto recebido: ${jsonText.substring(0, 200)}`);
            }
        } catch (parseErr) {
            throw new Error(`Erro ao parsear JSON: ${parseErr.message}. Texto original: ${jsonText.substring(0, 500)}`);
        }
    }
}

// 4. Validar que temos dados
if (!data) {
    throw new Error("Não foi possível encontrar dados na resposta. Estrutura recebida: " + JSON.stringify(input, null, 2).substring(0, 500));
}

// 5. Extrair lista de modelos
const models = data.models || [];
const total = data.total || models.length;

if (models.length === 0) {
    return [{
        json: {
            message: "Nenhum modelo BIM encontrado",
            total: 0,
            models: []
        }
    }];
}

// 6. Transformar em formato tabular (linhas para tabela)
const tabela = models.map(modelo => {
    // Formatar fileSize se disponível
    let fileSizeMB = modelo.fileSizeMB || 0;
    if (!fileSizeMB && modelo.fileSize) {
        fileSizeMB = parseFloat((modelo.fileSize / 1024 / 1024).toFixed(2));
    }
    
    // Formatar data se disponível
    let createdAt = modelo.createTime || '';
    if (createdAt) {
        try {
            const date = new Date(createdAt);
            createdAt = date.toLocaleString('pt-BR');
        } catch (e) {
            // Manter formato original se falhar
        }
    }
    
    return {
        Project_Name: modelo.projectName || '',
        File_Name: modelo.fileName || '',
        File_Type: modelo.fileType || '',
        Version: modelo.versionNumber || 0,
        File_Size: fileSizeMB > 0 ? `${fileSizeMB.toFixed(2)} MB` : 'N/A',
        File_Size_Bytes: modelo.fileSize || 0,
        Created_By: modelo.createUserName || '',
        Created_At: createdAt,
        View_in_ACC: modelo.viewInACC || modelo.links?.viewInACC || '',
        Viewer_URL: modelo.viewerUrl || modelo.links?.viewerUrl || '',
        Download_URL: modelo.downloadUrl || modelo.links?.downloadUrl || '',
        Project_ID: modelo.projectId || '',
        Item_ID: modelo.itemId || '',
        Version_ID: modelo.versionId || '',
        URN: modelo.urn || '',
        Display_Name: modelo.displayName || modelo.fileName || ''
    };
});

// 7. Retornar tabela como múltiplos itens para o n8n
return tabela.map(row => ({ json: row }));

