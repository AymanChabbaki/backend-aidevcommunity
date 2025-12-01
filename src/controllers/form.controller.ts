import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import * as XLSX from 'xlsx';

export const getAllForms = asyncHandler(async (req: AuthRequest, res: Response) => {
  const forms = await prisma.form.findMany({
    include: {
      _count: {
        select: { responses: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: forms
  });
});

export const createForm = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, fields, eventId } = req.body;

  const form = await prisma.form.create({
    data: {
      title,
      description,
      fields,
      eventId,
      createdBy: req.user!.id
    }
  });

  res.status(201).json({
    success: true,
    data: form
  });
});

export const getFormById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const form = await prisma.form.findUnique({
    where: { id },
    include: {
      event: {
        select: {
          id: true,
          title: true
        }
      },
      _count: {
        select: { responses: true }
      }
    }
  });

  if (!form) {
    return res.status(404).json({
      success: false,
      error: 'Form not found'
    });
  }

  res.json({
    success: true,
    data: form
  });
});

export const submitForm = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { answers, attachments } = req.body;

  const form = await prisma.form.findUnique({ where: { id } });

  if (!form) {
    return res.status(404).json({
      success: false,
      error: 'Form not found'
    });
  }

  const response = await prisma.formResponse.create({
    data: {
      formId: id,
      userId: req.user!.id,
      answers,
      attachments
    }
  });

  res.status(201).json({
    success: true,
    data: response,
    message: 'Form submitted successfully'
  });
});

export const getFormResponses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const responses = await prisma.formResponse.findMany({
    where: { formId: id },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: responses
  });
});

export const exportFormResponses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { format = 'csv' } = req.query; // Get format from query parameter (csv or xlsx)

  const form = await prisma.form.findUnique({ where: { id } });
  const responses = await prisma.formResponse.findMany({
    where: { formId: id },
    include: {
      user: {
        select: {
          displayName: true,
          email: true
        }
      }
    }
  });

  if (!form) {
    return res.status(404).json({
      success: false,
      error: 'Form not found'
    });
  }

  const fields = form.fields as any[];
  const headers = ['Name', 'Email', ...fields.map((f: any) => f.label), 'Submitted At'];
  
  // Prepare data rows
  const dataRows = responses.map((resp) => {
    const answers = resp.answers as any;
    return [
      resp.user?.displayName || 'Anonymous',
      resp.user?.email || '',
      ...fields.map((f: any) => {
        const answer = answers[f.id];
        if (answer === null || answer === undefined) return '';
        if (Array.isArray(answer)) return answer.join('; ');
        return answer;
      }),
      new Date(resp.createdAt).toLocaleString()
    ];
  });

  const baseFilename = `form-responses-${form.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}`;

  if (format === 'xlsx') {
    // Export as XLSX
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Responses');
    
    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.xlsx"`);
    res.send(buffer);
  } else {
    // Export as CSV
    const escapeCsvValue = (value: any): string => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const csvHeader = headers.map(escapeCsvValue).join(',') + '\n';
    const csvRows = dataRows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
    res.send('\uFEFF' + csv); // Add BOM for proper Excel UTF-8 encoding
  }
});

export const getUserSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const submission = await prisma.formResponse.findFirst({
    where: {
      formId: id,
      userId: req.user.id
    }
  });

  res.json({
    success: true,
    data: submission
  });
});

export const getUserSubmissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const submissions = await prisma.formResponse.findMany({
    where: {
      userId: req.user.id
    },
    select: {
      formId: true
    }
  });

  const formIds = submissions.map(s => s.formId);

  res.json({
    success: true,
    data: formIds
  });
});

export const deleteForm = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const form = await prisma.form.findUnique({ where: { id } });

  if (!form) {
    return res.status(404).json({
      success: false,
      error: 'Form not found'
    });
  }

  // Check if user is the creator, staff (own forms), or admin (all forms)
  if (form.createdBy !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to delete this form'
    });
  }

  await prisma.form.delete({ where: { id } });

  res.json({
    success: true,
    message: 'Form deleted successfully'
  });
});
