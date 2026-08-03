# Operator Gateway - Gate 3: armazenamento controlado da chave no Keychain

**Status:** preparação sintética; nenhuma chave real armazenada  
**Data:** 2026-08-03  
**Base:** `apidevelopers-platform/main@952311b39946a265a02bb35c288738d5e010f073`

## Objetivo

Preparar o controlador de armazenamento da chave privada da GitHub App no macOS Keychain sem executar qualquer gravação real.

## Autorização reservada

```text
IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN
```

A frase autoriza apenas a operação futura descrita neste gate. Não autoriza merge, criação da GitHub App, piloto real, chamada externa, escrita GitHub, deploy ou produção.

## Contrato

O controlador aceita apenas:

- `Uint8Array` entre 1 e 8192 bytes;
- plataforma `darwin`;
- execução explicitamente habilitada;
- autorização exata;
- item novo, sem sobrescrita;
- `service`: `digital.apidevelopers.operator-gateway`;
- `account`: `github-app-private-key`;
- writer injetado;
- confirmação `created=true` e `replaced=false`.

A evidência permitida contém somente service, account, fingerprint SHA-256, timestamp e flags sanitizadas. A chave nunca é retornada.

## Segurança

- desabilitado por padrão;
- sem `child_process`, shell, rede ou ambiente;
- sem comando real do Keychain;
- sem item real;
- sem GitHub App ou token real;
- buffer temporário zerado em sucesso e falha;
- erro do writer sanitizado;
- sobrescrita proibida;
- produção e repositório declarados sem alteração.

## Antes da gravação real

1. GitHub App institucional criada e instalada por endpoint verificável.
2. Chave privada gerada e conferida sem aparecer em chat, log ou artefato.
3. Leitor e writer reais revisados.
4. Usuário/processo autorizado definido.
5. Runbook de remoção e rotação aprovado.
6. Fingerprint pública conferida.
7. Aprovação explícita separada do Igor.

## Rollback

Remover ou rotacionar o item dedicado, suspender a instalação da GitHub App, desabilitar workflows reais, preservar somente evidência sanitizada e manter o gateway em deny-by-default.

## Resultado deste gate

Este gate implementa apenas o controlador e os testes sintéticos. Nenhuma chave real é criada, recebida, armazenada ou acessada.
