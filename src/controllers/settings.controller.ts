import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Get all settings or by category
export const getSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { category } = req.query;

  const where = category ? { category: category as string } : {};

  const settings = await prisma.setting.findMany({
    where,
    orderBy: { category: 'asc' }
  });

  // Transform to key-value object grouped by category
  const grouped: any = {};
  settings.forEach(setting => {
    if (!grouped[setting.category]) {
      grouped[setting.category] = {};
    }
    grouped[setting.category][setting.key] = setting.value;
  });

  res.json({
    success: true,
    data: category ? grouped[category as string] || {} : grouped
  });
});

// Update or create a setting
export const updateSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { key, value, category } = req.body;

  if (!key || !category) {
    return res.status(400).json({
      success: false,
      error: 'Key and category are required'
    });
  }

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value, category },
    create: { key, value, category }
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'UPDATE_SETTING',
      entity: 'Setting',
      entityId: setting.id,
      metadata: { key, oldValue: null, newValue: value }
    }
  });

  res.json({
    success: true,
    data: setting
  });
});

// Bulk update settings
export const bulkUpdateSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { category, settings } = req.body;

  if (!category || !settings || typeof settings !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Category and settings object are required'
    });
  }

  const updates = [];

  for (const [key, value] of Object.entries(settings)) {
    const fullKey = `${category}.${key}`;
    updates.push(
      prisma.setting.upsert({
        where: { key: fullKey },
        update: { value: value as any, category },
        create: { key: fullKey, value: value as any, category }
      })
    );
  }

  await Promise.all(updates);

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'BULK_UPDATE_SETTINGS',
      entity: 'Setting',
      entityId: category,
      metadata: { category, settingsCount: Object.keys(settings).length }
    }
  });

  res.json({
    success: true,
    message: 'Settings updated successfully'
  });
});

// Delete a setting
export const deleteSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { key } = req.params;

  await prisma.setting.delete({
    where: { key }
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'DELETE_SETTING',
      entity: 'Setting',
      entityId: key,
      metadata: { key }
    }
  });

  res.json({
    success: true,
    message: 'Setting deleted successfully'
  });
});

// Initialize default settings
export const initializeSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const defaultSettings = [
    // General
    { key: 'general.siteName', value: 'AI Dev Community', category: 'general' },
    { key: 'general.siteDescription', value: 'A community for AI and development enthusiasts', category: 'general' },
    { key: 'general.siteUrl', value: 'https://aidevcommunity.com', category: 'general' },
    { key: 'general.contactEmail', value: 'contact@aidevcommunity.com', category: 'general' },
    { key: 'general.maintenanceMode', value: false, category: 'general' },
    
    // Notifications
    { key: 'notifications.emailNotifications', value: true, category: 'notifications' },
    { key: 'notifications.eventReminders', value: true, category: 'notifications' },
    { key: 'notifications.pollNotifications', value: true, category: 'notifications' },
    { key: 'notifications.newsletterEnabled', value: true, category: 'notifications' },
    { key: 'notifications.adminAlerts', value: true, category: 'notifications' },
    
    // Security
    { key: 'security.requireEmailVerification', value: true, category: 'security' },
    { key: 'security.allowRegistration', value: true, category: 'security' },
    { key: 'security.sessionTimeout', value: 30, category: 'security' },
    { key: 'security.maxLoginAttempts', value: 5, category: 'security' },
    { key: 'security.twoFactorEnabled', value: false, category: 'security' },
    
    // Email
    { key: 'email.smtpHost', value: '', category: 'email' },
    { key: 'email.smtpPort', value: 587, category: 'email' },
    { key: 'email.smtpUser', value: '', category: 'email' },
    { key: 'email.smtpPassword', value: '', category: 'email' },
    { key: 'email.fromEmail', value: 'noreply@aidevcommunity.com', category: 'email' },
    { key: 'email.fromName', value: 'AI Dev Community', category: 'email' },
  ];

  const results = [];
  for (const setting of defaultSettings) {
    const result = await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting
    });
    results.push(result);
  }

  res.json({
    success: true,
    message: 'Default settings initialized',
    data: results
  });
});
