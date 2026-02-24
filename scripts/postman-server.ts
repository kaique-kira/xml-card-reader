import express from "express";
import multer from "multer";
import { parseXml, generateApduWithMac, parseEmvCardXml } from "../index";

const app = express();
const port = Number(process.env.PORT ?? 3333);
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.text({ type: ["application/xml", "text/xml", "text/plain"] }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/parse", upload.single("file"), (req, res) => {
  try {
    const xml = req.file ? req.file.buffer.toString("utf-8") : "";
    const parsed = parseXml(xml);

    let cardAsset = null;
    try {
      cardAsset = parseEmvCardXml(xml);
    } catch {
      // Se não for um XML EMVCoL3CardImage, ignoramos o erro e retornamos só o parse genérico
      cardAsset = null;
    }

    res.status(200).json({
      success: true,
      parsed,
      cardAsset,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";

    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

app.post("/mac", upload.single("file"), (req, res) => {
  try {
    const { atc, ac, sk, mk, rand } = req.body ?? {};

    // Se vier arquivo, usamos o conteúdo como APDU (texto hex)
    const fileContent = req.file
      ? req.file.buffer.toString("utf-8").trim()
      : undefined;

    const apdu = (req.body?.apdu as string | undefined) ?? fileContent;

    if (!apdu) {
      throw new Error("Parâmetro apdu é obrigatório (no body ou no arquivo)");
    }

    const result = generateApduWithMac({ apdu, atc, ac, sk, mk, rand });

    res.status(200).json({
      success: true,
      apdu: result.apduWithMac,
      nextRand: result.nextRand,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";

    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Servidor de teste Postman ativo em http://localhost:${port}`);
});
