# Guia: Custom Nodes no n8n Self-Hosted

Este documento consolida o conhecimento técnico necessário para desenvolver e deployar nós customizados no n8n self-hosted.

---

## TL;DR

| Aspecto | Resumo |
|---------|--------|
| **Linguagem** | TypeScript (transpilado para JS) |
| **Deploy** | Volume Docker em `~/.n8n/custom/` |
| **Contexto do Workflow** | `this.getWorkflow()` → `{id, name, active}` |
| **HTTP Requests** | `this.helpers.httpRequest(options)` |
| **Build** | `npm run build` (tsc) |

---

## 1. Anatomia de um Custom Node

### Estrutura de Arquivos

```
n8n-nodes-<nome>/
├── package.json           # Metadados do pacote
├── tsconfig.json          # Config TypeScript
├── nodes/
│   └── <NodeName>/
│       └── <NodeName>.node.ts   # Implementação do nó
└── dist/                  # Output do build (gerado)
```

### package.json Essencial

```json
{
  "name": "n8n-nodes-<nome>",
  "version": "0.1.0",
  "keywords": ["n8n-community-node-package"],
  "main": "dist/nodes/<NodeName>/<NodeName>.node.js",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "nodes": [
      "dist/nodes/<NodeName>/<NodeName>.node.js"
    ]
  },
  "scripts": {
    "build": "tsc"
  },
  "peerDependencies": {
    "n8n-workflow": "*"
  }
}
```

> [!IMPORTANT]
> O campo `keywords` deve conter `"n8n-community-node-package"` para o n8n reconhecer o pacote.

---

## 2. Implementação do Nó

### Estrutura Básica

```typescript
import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class MeuNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Meu Node',
    name: 'meuNode',              // Identificador único (camelCase)
    icon: 'fa:globe',             // FontAwesome ou 'file:icon.svg'
    group: ['transform'],
    version: 1,
    description: 'Descrição do nó',
    defaults: { name: 'Meu Node' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      // Definição dos campos de input
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    // Lógica de execução
    return [returnData];
  }
}
```

---

## 3. Acessando o Contexto do Workflow

O n8n expõe informações do workflow via `IExecuteFunctions`:

```typescript
async execute(this: IExecuteFunctions) {
  // Informações do Workflow
  const workflow = this.getWorkflow();
  workflow.id;      // string - ID único do workflow
  workflow.name;    // string - Nome do workflow
  workflow.active;  // boolean - Se está ativo

  // Informações da Execução
  const execution = this.getExecutionId();  // ID da execução atual

  // Informações do Nó
  const node = this.getNode();
  node.name;        // Nome do nó na instância
  node.type;        // Tipo do nó
  node.typeVersion; // Versão do tipo
}
```

---

## 4. Fazendo Requisições HTTP

Use sempre `this.helpers.httpRequest()` em vez de fetch/axios diretamente:

```typescript
import type { IHttpRequestOptions } from 'n8n-workflow';

const options: IHttpRequestOptions = {
  method: 'POST',
  url: 'https://api.exemplo.com/endpoint',
  headers: {
    'Content-Type': 'application/json',
    'X-Custom-Header': 'valor',
  },
  body: { key: 'value' },
  returnFullResponse: true,  // Retorna headers + status + body
};

const response = await this.helpers.httpRequest(options);
```

> [!TIP]
> `httpRequest` já gerencia proxy, SSL e outras configs do n8n automaticamente.

---

## 5. Definindo Propriedades (UI do Nó)

### Tipos Disponíveis

| Tipo | Uso |
|------|-----|
| `string` | Input de texto simples |
| `number` | Input numérico |
| `boolean` | Toggle on/off |
| `options` | Dropdown com opções |
| `multiOptions` | Seleção múltipla |
| `json` | Editor JSON |
| `fixedCollection` | Conjunto repetível de campos |

### Exemplo Prático

```typescript
properties: [
  {
    displayName: 'Método',
    name: 'method',
    type: 'options',
    options: [
      { name: 'GET', value: 'GET' },
      { name: 'POST', value: 'POST' },
    ],
    default: 'GET',
  },
  {
    displayName: 'URL',
    name: 'url',
    type: 'string',
    default: '',
    required: true,
  },
  {
    displayName: 'Enviar Headers',
    name: 'sendHeaders',
    type: 'boolean',
    default: false,
  },
  {
    displayName: 'Headers',
    name: 'headers',
    type: 'fixedCollection',
    displayOptions: {
      show: { sendHeaders: [true] },  // Mostra só quando sendHeaders = true
    },
    options: [
      {
        name: 'items',
        displayName: 'Header',
        values: [
          { displayName: 'Nome', name: 'name', type: 'string', default: '' },
          { displayName: 'Valor', name: 'value', type: 'string', default: '' },
        ],
      },
    ],
  },
],
```

### Lendo Valores no Execute

```typescript
const method = this.getNodeParameter('method', itemIndex) as string;
const url = this.getNodeParameter('url', itemIndex) as string;
const headers = this.getNodeParameter('headers.items', itemIndex, []) as Array<{
  name: string;
  value: string;
}>;
```

---

## 6. Deploy no Docker Self-Hosted

### Opção 1: Volume Montado (Recomendado para Dev)

```yaml
# docker-compose.yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    volumes:
      - ./n8n-nodes-custom:/home/node/.n8n/custom/n8n-nodes-custom
```

### Opção 2: Custom Image (Recomendado para Prod)

```dockerfile
FROM docker.n8n.io/n8nio/n8n

# Copiar nó customizado
COPY ./n8n-nodes-custom /home/node/.n8n/custom/n8n-nodes-custom

# Instalar dependências
RUN cd /home/node/.n8n/custom/n8n-nodes-custom && npm install --production
```

> [!WARNING]
> Após modificar o nó, é necessário **reiniciar o container** para o n8n recarregar os custom nodes.

---

## 7. Debugging e Troubleshooting

### Logs do Container

```bash
docker-compose logs -f n8n
```

### Verificar se o Nó Foi Carregado

Procure nos logs por:
```
Loaded custom node: httpRequestContext
```

### Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| Nó não aparece | Build não executado | `npm run build` |
| `Cannot find module` | Dependências faltando | `npm install` |
| Erro de tipos | TypeScript incompatível | Verificar `n8n-workflow` version |
| Nó aparece mas não executa | Erro no `execute()` | Verificar logs do container |

---

## 8. Boas Práticas

### ✅ Faça

- Use `this.helpers.httpRequest()` para requisições
- Trate erros com `this.continueOnFail()`
- Valide inputs antes de usar
- Documente o nó com `description` claro

### ❌ Evite

- Usar `require()` de módulos externos diretamente
- Hardcode de secrets (use Credentials)
- Lógica síncrona bloqueante
- Modificar o state global

---

## 9. Referências

| Recurso | Link |
|---------|------|
| Documentação Oficial | https://docs.n8n.io/integrations/creating-nodes/ |
| Starter Template | https://github.com/n8n-io/n8n-nodes-starter |
| Código-fonte HTTP Request | [GitHub n8n](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/HttpRequest) |
| n8n-workflow Types | Incluído via `peerDependencies` |

---

## Exemplo Completo: POC HTTP Request Context

Esta POC implementa um nó que injeta automaticamente o contexto do workflow nos headers HTTP:

```
n8n-nodes-http-context/
├── package.json
├── tsconfig.json
└── nodes/HttpRequestContext/
    └── HttpRequestContext.node.ts
```

**Resultado**: Toda requisição feita por este nó inclui automaticamente:
- `X-Workflow-Id`: ID único do workflow
- `X-Workflow-Name`: Nome do workflow

Isso permite identificar a origem das chamadas em WAFs, firewalls e logs de APIs externas.
