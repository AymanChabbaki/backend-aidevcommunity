import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '../lib/prisma';

// ─── Cloudinary setup
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Gemini client factory
const getApiKey = (): string => {
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured in the environment.');
  return key;
};

const getAI = (): GoogleGenAI => new GoogleGenAI({ apiKey: getApiKey() });

// ─── POST /api/eid/generate ────────────────────────────────────────────
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
      `Draw a funny, exaggerated caricature illustration of a Moroccan tech enthusiast named "${n}" ` +
      `who is a proud member of AI Dev Community — a Moroccan tech community. ` +
      `They are obsessed with ${i} and in 2030 they have become an unstoppable ${d}. ` +
      `Exaggerate their personality traits based on their interests (${i}) in a funny, affectionate way — ` +
      `for example oversized gear, a tiny robot sidekick, holographic keyboard floating around them, etc. ` +
      `Setting: a festive Traditional Moroccan Eid Celebration in 2030, showing a futuristic Moroccan salon or tech hub. ` +
      `They should be wearing a stylish futuristic traditional Moroccan Jellaba or Jabador combined with high-tech wearables, ` +
      `perhaps holding a glowing high-tech cup of Moroccan mint tea or traditional Eid sweets (like Kaab el Ghazal). ` +
      `The scene should have neon lights mixing Moroccan zellige patterns with sci-fi aesthetics, ` +
      `and a holographic banner visible in the scene that reads "AI Dev Community" and "Eid Mubarak 2026". ` +
      (hasPhoto
        ? `IMPORTANT: Use the provided reference photo to accurately replicate their face, skin tone, hair style and color, and facial features. Keep them recognizable. `
        : `They look like a confident modern Moroccan person. `) +
      `Art style: vibrant Pixar/cartoon caricature, warm festive colors, fun and inspiring mood, high detail, digital illustration.`;

    const imageParts: Array<Record<string, unknown>> = [{ text: imagePromptText }];
    if (hasPhoto) {
      imageParts.push({ inlineData: { mimeType: photoMimeType, data: photoBase64 } });
    }

    // ── Build compliment prompt ───────────────────────────────────────────
    const complimentPrompt =
      `اكتب كلاما دافئا ومضحكا وممتعا للمعايدة بعيد الفطر أو الأضحى باللهجة المغربية الدارجة لشخص اسمه ${n}، ` +
      `وهو عضو مهووس بالتكنولوجيا في مجتمع AI Dev Community بالمغرب. ` +
      `هذا الشخص مهتم بـ ${i} ويحلم بأن يصبح ${d}. ` +
      `دخل شي مزحة خفيفة على اهتماماته (${i}) وكيفاش غايدوز العيد مع التكنولوجيا بأسلوب لطيف ومحب، وبارك ليه العيد. ` +
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

    // ── Upload generated image to Cloudinary ──────────────────────────────
    let savedImageUrl = imageDataUrl;
    try {
      const uploadResult = await cloudinary.uploader.upload(imageDataUrl, {
        folder: 'eid-submissions',
        resource_type: 'image',
      });
      savedImageUrl = uploadResult.secure_url;
    } catch (uploadErr) {
      console.error('[Eid] Cloudinary upload error (proceeding with base64):', uploadErr);
    }

    // ── Persist submission ─────────────────────────────────────────────────
    try {
      await prisma.eidSubmission.create({
        data: { name: n, interests: i, dream: d, imageUrl: savedImageUrl, compliment },
      });
    } catch (dbErr) {
      console.error('[Eid] DB save error (non-fatal):', dbErr);
    }

    res.json({ imageDataUrl: savedImageUrl, compliment });
  } catch (err: unknown) {
    console.error('[Eid] generate error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
};

// ─── POST /api/eid/upload-photo ────────────────────────────────────────
export const uploadPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file as (Express.Multer.File & { path?: string }) | undefined;
    if (!file) {
      res.status(400).json({ error: 'No photo file provided.' });
      return;
    }
    const url: string = (file as unknown as { path: string }).path;
    res.json({ url });
  } catch (err: unknown) {
    console.error('[Eid] uploadPhoto error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
};

// ─── GET /api/eid/submissions ─────────────────────────────────────────
export const getSubmissions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const submissions = await prisma.eidSubmission.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ submissions });
  } catch (err: unknown) {
    console.error('[Eid] getSubmissions error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
};
