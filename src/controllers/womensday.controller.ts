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
    const { name, interests, dream, photoBase64, photoMimeType } = req.body as {
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

    const n = name.trim();
    const i = interests.trim();
    const d = dream.trim();
    const hasPhoto = !!(photoBase64 && photoMimeType);

    // ── Build image-generation prompt ──────────────────────────────────────
    const imagePromptText =
      // Who she is
      `Draw a funny, exaggerated caricature illustration of a Moroccan woman named "${n}" ` +
      `who is a proud member of AI Dev Community — a Moroccan tech community for women in AI. ` +
      // What makes her unique
      `She is obsessed with ${i} and in 2030 she has become an unstoppable ${d}. ` +
      // Funny exaggeration based on interests
      `Exaggerate her personality traits based on her interests (${i}) in a funny, affectionate way — ` +
      `for example oversized gear, a tiny robot sidekick, holographic keyboard floating around her, ` +
      `coffee cup with AI logo, stacks of tech books, etc. ` +
      // Environment
      `Setting: futuristic Moroccan tech hub in 2030, holographic screens showing code and AI dashboards, ` +
      `neon lights mixing Moroccan zellige patterns with sci-fi aesthetics, ` +
      `a banner or badge visible in the scene that reads "AI Dev Community" and "Women's Day 2026". ` +
      // Her appearance
      (hasPhoto
        ? `IMPORTANT: Use the provided reference photo to accurately replicate her face, skin tone, hair style and color, and facial features. Keep her recognizable. `
        : `She looks like a confident Moroccan woman, modern style. `) +
      // Style direction
      `Art style: vibrant Pixar/cartoon caricature, warm colors, fun and empowering mood, high detail, digital illustration.`;

    // Build parts array — text first, then optional face reference photo
    const imageParts: Array<Record<string, unknown>> = [{ text: imagePromptText }];
    if (hasPhoto) {
      imageParts.push({ inlineData: { mimeType: photoMimeType, data: photoBase64 } });
    }

    // ── Build compliment prompt ───────────────────────────────────────────
    const complimentPrompt =
      `اكتب كلاما دافئا ومضحكا وممتعا باللهجة المغربية الدارجة لامرأة اسمها ${n}، ` +
      `عضوة في مجتمع AI Dev Community ديال النساء في التكنولوجيا بالمغرب. ` +
      `هي مهتمة بـ ${i} وتحلم بأن تصبح ${d}. ` +
      `دخل شي مزحة خفيفة على اهتماماتها (${i}) بأسلوب لطيف ومحب. ` +
      `الطول: 2 إلى 3 جمل. اكتب فقط الكلام من غير أي شرح أو مقدمة.`;

    // ── Run both in parallel ──────────────────────────────────────────────
    const [imageResult, complimentResult] = await Promise.all([
      ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: imageParts }] as never,
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
