# Processamento de Resposta da Tool get-all-bim-models no n8n

## Estrutura da Resposta

A tool `get-all-bim-models` retorna os dados no seguinte formato:

```json
{
  "total": 10,
  "accountId": "b.xxxx-xxxx-xxxx",
  "models": [
    {
      "projectId": "xxxx-xxxx-xxxx",
      "projectName": "Nome do Projeto",
      "fileName": "arquivo.rvt",
      "fileType": "RVT",
      "itemId": "urn:...",
      "versionId": "urn:...",
      "versionNumber": 1,
      "fileSize": 1048576,
      "fileSizeMB": 1.0,
      "createTime": "2024-01-01T00:00:00Z",
      "createUserName": "user@email.com",
      "displayName": "arquivo.rvt",
      "urn": "urn:adsk.obj:...",
      "viewInACC": "https://acc.autodesk.com/...",
      "viewerUrl": "https://aps.autodesk.com/viewer?urn=...",
      "downloadUrl": "https://..."
    }
  ]
}
```

## Código para n8n Code Node

### Versão Simplificada (Recomendada)

Use o código do arquivo `n8n-code-process-bim-models.js` que:

1. Procura os dados em múltiplos formatos de resposta
2. Extrai e parseia o JSON automaticamente
3. Transforma em formato tabular
4. Retorna múltiplos itens para processamento no n8n

### Como Usar

1. **Adicione um n8n Code Node** após o nó MCP Client
2. **Cole o código** do arquivo `n8n-code-process-bim-models.js`
3. **O código retornará** múltiplos itens, um para cada modelo BIM encontrado

### Formato de Saída

Cada item retornado terá:

- `Project_Name`: Nome do projeto
- `File_Name`: Nome do arquivo
- `File_Type`: Tipo do arquivo (DWG, IFC, RVT, NWD, NWF)
- `Version`: Número da versão
- `File_Size_MB`: Tamanho em MB
- `File_Size_Bytes`: Tamanho em bytes
- `Created_By`: Usuário que criou
- `Created_At`: Data de criação formatada
- `View_in_ACC`: Link para visualizar no ACC
- `Viewer_URL`: Link para visualizar no Viewer
- `Download_URL`: Link para download
- `Project_ID`: ID do projeto
- `Item_ID`: ID do item
- `Version_ID`: ID da versão
- `URN`: URN do modelo
- `Display_Name`: Nome de exibição

## Troubleshooting

### Erro: "Não foi possível encontrar dados de modelos BIM"

Isso significa que o código não encontrou os dados na resposta. Verifique:

1. **Estrutura da resposta**: Adicione um nó de debug antes do Code Node para ver a estrutura completa
2. **Formato do MCP**: Verifique se o MCP Server está retornando no formato esperado
3. **Logs**: O código faz log da estrutura recebida quando há erro

### Erro: "Não foi possível parsear o JSON"

Isso significa que o JSON está mal formatado. Verifique:

1. **Markdown**: O código remove automaticamente blocos de markdown
2. **Escape**: Verifique se caracteres especiais estão escapados corretamente
3. **Encoding**: Verifique se o encoding está correto (UTF-8)

## Exemplo de Uso Completo

```javascript
// 1. Executar tool get-all-bim-models via MCP Client
// 2. Processar resposta com Code Node (usar código do n8n-code-process-bim-models.js)
// 3. Usar dados processados em outros nós (Google Sheets, Database, etc.)
```

## Notas

- A tool busca recursivamente em todas as pastas de todos os projetos
- Pode demorar alguns minutos dependendo do número de projetos e arquivos
- A tool processa apenas arquivos com extensões: .dwg, .ifc, .rvt, .nwd, .nwf
- Links de visualização só são gerados se o URN estiver disponível

