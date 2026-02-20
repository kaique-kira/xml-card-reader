import { readFile } from "node:fs/promises";
import { stdin } from "node:process";
import { parseXml } from "../index";

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function getPositionalArg(): string | undefined {
  const args = process.argv.slice(2);
  return args.find((arg) => !arg.startsWith("-"));
}

async function readFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise<string>((resolve, reject) => {
    stdin.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    stdin.on("error", reject);
  });
}

async function getXmlInput(): Promise<string> {
  const xmlFromArg = getArg("--xml");
  if (xmlFromArg) {
    return xmlFromArg;
  }

  const filePath = getArg("--file") ?? getPositionalArg();
  if (filePath) {
    return readFile(filePath, "utf8");
  }

  if (!stdin.isTTY) {
    return readFromStdin();
  }

  throw new Error(
    'Informe um XML usando --file <caminho>, passando o caminho direto ou --xml "<root/>" (também aceita pipe via stdin).',
  );
}

async function main(): Promise<void> {
  const xml = await getXmlInput();
  const parsed = parseXml(xml);

  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  process.stderr.write(`Erro: ${message}\n`);
  process.exit(1);
});
