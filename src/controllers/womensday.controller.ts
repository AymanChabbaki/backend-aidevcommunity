import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';

// ─── Cloudinary setup (shared config already loaded via upload.ts but we
//     initialise here too for safety – idempotent) ─────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Gemini client factory ───────────────────────────────────────────────────
const getApiKey = (): string => {
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured in the environment.');
  return key;
};

const getAI = (): GoogleGenAI => new GoogleGenAI({ apiKey: getApiKey() });

// ─── POST /api/womensday/generate ────────────────────────────────────────────
//  Body: { name, interests, dream, photoBase64?, photoMimeType? }
//  Returns: { imageDataUrl, compliment }
export const generate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, interests, dream } = req.body as {
      name?: string;
      interests?: string;
      dream?: string;
      photoBase64?: string;
      photoMimeType?: string;
    };

    if (!name?.trim() || !interests?.trim() || !dream?.trim()) {
      res.status(400).json({ error: 'name, interests and dream are required.' });
      return;
    }

    const ai = getAI();

    // ── Build image-generation prompt (Imagen 3) ───────────────────────────
    const imagePromptText =
      `Colorful caricature illustration of a Moroccan woman named ${name.trim()} in the year 2030. ` +
      `She is passionate about ${interests.trim()} and is a ${dream.trim()}. ` +
      `Futuristic tech environment: holographic screens, AI interfaces, robots, coding dashboards. ` +
      `Style: fun caricature, modern digital illustration, vibrant colors, inspiring, empowering women in technology.`;

    // ── Build compliment prompt ───────────────────────────────────────────
    const complimentPrompt =
      `اكتب كلاما دافئا ومحفزا باللهجة المغربية الدارجة لامرأة اسمها ${name.trim()}. ` +
      `هي مهتمة بـ ${interests.trim()} وتحلم بأن تصبح ${dream.trim()}. ` +
      `الأسلوب يجب يكون ودود ومحفز وإيجابي. ` +
      `الطول: 2 إلى 3 جمل. اكتب فقط الكلام من غير أي شرح أو مقدمة.`;

    // ── Run both in parallel ──────────────────────────────────────────────
    const [imageResult, complimentResult] = await Promise.all([
      ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: [{ text: imagePromptText }] }] as never,
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: complimentPrompt,
      }),
    ]);

    // ── Extract image ─────────────────────────────────────────────────────
    let imageDataUrl: string | null = null;
    const candidate = imageResult.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts as Array<Record<string, unknown>>) {
        const id = part['inlineData'] as { data: string; mimeType: string } | undefined;
        if (id?.data) {
          imageDataUrl = `data:${id.mimeType ?? 'image/png'};base64,${id.data}`;
          break;
        }
      }
    }
    if (!imageDataUrl) {
      res.status(502).json({ error: 'AI did not return an image. Please try again.' });
      return;
    }

    // ── Extract compliment ─────────────────────────────────────────────────
    const compliment = (complimentResult as unknown as { text: string }).text?.trim();
    if (!compliment) {
      res.status(502).json({ error: 'AI did not return a compliment. Please try again.' });
      return;
    }

    res.json({ imageDataUrl, compliment });
  } catch (err: unknown) {
    console.error('[WomensDay] generate error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
};

// ─── POST /api/womensday/upload-photo ────────────────────────────────────────
//  Multipart: field "photo"
//  Returns: { url }  (Cloudinary secure URL)
//  Note: multer-storage-cloudinary already uploads the file before this
//        handler runs; the URL sits at req.file.path (Cloudinary URL).
export const uploadPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file as (Express.Multer.File & { path?: string }) | undefined;
    if (!file) {
      res.status(400).json({ error: 'No photo file provided.' });
      return;
    }

    // When using CloudinaryStorage, multer puts the secure URL in file.path
    const url: string = (file as unknown as { path: string }).path;
    res.json({ url });
  } catch (err: unknown) {
    console.error('[WomensDay] uploadPhoto error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
};
