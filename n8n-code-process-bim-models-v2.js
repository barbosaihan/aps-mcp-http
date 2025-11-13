// n8n Code Node - Processar resposta da tool get-all-bim-models
// Versão 2.0 - Mais robusta e compatível com diferentes formatos de resposta

const input = items[0].json;

// Função auxiliar para extrair JSON de uma string
function extractJSON(text) {
    if (!text || typeof text !== 'string') return null;
    
    // Remover markdown code blocks
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // Tentar parse direto
    try {
        return JSON.parse(text);
    } catch (e) {
        // Tentar extrair JSON do texto
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e2) {
                return null;
            }
        }
    }
    return null;
}

// 1. Tentar encontrar dados em diferentes lugares da resposta
let data = null;

// Cenário 1: Dados já vêm parseados em input.result
if (input.result) {
    // Se result.content existe (formato MCP)
    if (input.result.content && Array.isArray(input.result.content)) {
        for (const block of input.result.content) {
            if (block.type === "text" && block.text) {
                const parsed = extractJSON(block.text);
                if (parsed && (parsed.models || parsed.total !== undefined)) {
                    data = parsed;
                    break;
                }
            }
        }
    }
    // Se result já contém os dados diretamente
    else if (input.result.models || input.result.total !== undefined) {
        data = input.result;
    }
}

// Cenário 2: Dados em outros caminhos comuns
if (!data) {
    const possiblePaths = [
        input.content?.[0]?.text,
        input.content?.[1]?.text,
        input.text,
        input.output,
        input.response,
        input.data
    ];
    
    for (const path of possiblePaths) {
        if (path) {
            if (typeof path === 'object' && (path.models || path.total !== undefined)) {
                data = path;
                break;
            } else if (typeof path === 'string') {
                const parsed = extractJSON(path);
                if (parsed && (parsed.models || parsed.total !== undefined)) {
                    data = parsed;
                    break;
                }
            }
        }
    }
}

// Cenário 3: Se ainda não encontrou, tentar parsear o input inteiro como JSON string
if (!data && typeof input === 'string') {
    data = extractJSON(input);
}

// 2. Validar que temos dados
if (!data) {
    // Log para debug (remover em produção)
    console.log("Input recebido:", JSON.stringify(input, null, 2).substring(0, 1000));
    throw new Error("Não foi possível encontrar dados de modelos BIM na resposta. Verifique o formato da resposta do MCP Server.");
}

// 3. Extrair lista de modelos
const models = Array.isArray(data.models) ? data.models : [];
const total = data.total !== undefined ? data.total : models.length;

// 4. Validar que temos modelos
if (models.length === 0) {
    return [{
        json: {
            message: "Nenhum modelo BIM encontrado",
            total: 0,
            accountId: data.accountId || '',
            models: []
        }
    }];
}

// 5. Transformar em formato tabular
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
            createdAt = date.toLocaleString('pt-BR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {
            // Manter formato original
        }
    }
    
    // Extrair links (pode estar em diferentes formatos)
    const viewInACC = modelo.viewInACC || modelo.links?.viewInACC || '';
    const viewerUrl = modelo.viewerUrl || modelo.links?.viewerUrl || '';
    const downloadUrl = modelo.downloadUrl || modelo.links?.downloadUrl || '';
    
    return {
        // Informações principais
        Project_Name: modelo.projectName || '',
        File_Name: modelo.fileName || '',
        File_Type: modelo.fileType || '',
        Version: modelo.versionNumber || 0,
        
        // Tamanho do arquivo
        File_Size_MB: fileSizeMB > 0 ? fileSizeMB.toFixed(2) : '0',
        File_Size_Bytes: modelo.fileSize || 0,
        
        // Metadados
        Created_By: modelo.createUserName || '',
        Created_At: createdAt,
        Display_Name: modelo.displayName || modelo.fileName || '',
        
        // Links
        View_in_ACC: viewInACC,
        Viewer_URL: viewerUrl,
        Download_URL: downloadUrl,
        
        // IDs técnicos
        Project_ID: modelo.projectId || '',
        Item_ID: modelo.itemId || '',
        Version_ID: modelo.versionId || '',
        URN: modelo.urn || '',
        
        // Index para referência
        Index: index + 1
    };
});

// 6. Retornar tabela como múltiplos itens
return tabela.map(row => ({ json: row }));

