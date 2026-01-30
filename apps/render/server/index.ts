import express from "express";

const PORT = Number(process.env.PORT) || 3001;

const app = express();

app.listen(PORT, () => {
  console.info(`Render server running on port ${PORT}`);
});