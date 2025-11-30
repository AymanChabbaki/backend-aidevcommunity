-- Add password reset token fields to users table
ALTER TABLE `users` 
ADD COLUMN `reset_token` VARCHAR(191) NULL AFTER `study_program`,
ADD COLUMN `reset_token_expiry` DATETIME(3) NULL AFTER `reset_token`;

-- Create index on reset_token for faster lookups
CREATE INDEX `users_reset_token_idx` ON `users`(`reset_token`);
