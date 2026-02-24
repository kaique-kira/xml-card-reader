# xml-card-reader

Biblioteca TypeScript para parse de XML genérico e conversão de XML EMV para modelo de cartão/APDU.

## Instalação

```bash
npm install xml-card-reader
```

## API principal

```ts
import {
  parseXml,
  parseXmlFile,
  isValidXml,
  parseEmvCardXml,
  parseEmvCardXmlFile,
} from "xml-card-reader";
```

### Parse XML genérico

```ts
const parsed = parseXml('<root id="1"><name>Kaique</name></root>');
const parsedFromFile = await parseXmlFile("./meu-arquivo.xml");
const ok = isValidXml("<root><a>1</a></root>");
```

### Parse XML EMV

```ts
const asset = parseEmvCardXml(xmlString);
const assetFromFile = await parseEmvCardXmlFile("./samples/AEIPS 03 EP 03.xml");
```

## Scripts úteis (desenvolvimento)

- Build: `npm run build`
- Testes: `npm test`
- Check completo: `npm run release:check`
- Parse por arquivo: `npm run parse:file -- ./qualquer-arquivo.xml`
- Parse por stdin: `echo '<root><id>1</id></root>' | npm run parse:stdin`
- Servidor local para Postman: `npm run dev:postman`

## Publicar no NPM

1. Login no npm:

```bash
npm login
```

2. Validar pacote antes de publicar:

```bash
npm run release:check
```

3. Subir versão:

```bash
npm version patch
```

4. Publicar:

```bash
npm publish
```

> O script `prepublishOnly` já garante build + testes na publicação.
