import { sendEmail as sendEmailService } from '../services/email.service';

/**
 * Simple wrapper for email service to match the signature used in controllers
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param html - HTML content of the email
 */
export const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  return sendEmailService({
    to,
    subject,
    html
  });
};
