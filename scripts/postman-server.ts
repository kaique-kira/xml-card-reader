import express from "express";
import multer from "multer";
import { parseXml } from "../index";

const app = express();
const port = Number(process.env.PORT ?? 3333);
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.text({ type: ["application/xml", "text/xml", "text/plain"] }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/parse", upload.single("file"), (req, res) => {
  try {
    const xml = req.file ? req.file.buffer.toString("utf-8") : "";
    const parsed = parseXml(xml);

    res.status(200).json({
      success: true,
      parsed,
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
