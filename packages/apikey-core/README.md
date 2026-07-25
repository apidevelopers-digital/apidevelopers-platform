# @apidevelopers/apikey-core

Primitivas criptográficas e de ciclo de vida para API Keys.

## Responsabilidades

- gerar chaves no namespace `apid_`;
- calcular SHA-256;
- comparar segredos de forma resistente a timing;
- verificar uma chave contra o hash armazenado;
- criar registros de chave;
- revogar registros de forma imutável;
- produzir representação pública sem hash.

A chave em texto puro existe apenas no momento da emissão e nunca deve ser persistida.
