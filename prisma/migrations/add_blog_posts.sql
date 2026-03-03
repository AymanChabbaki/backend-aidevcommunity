-- Add NotificationMessage table
CREATE TABLE IF NOT EXISTS `notification_messages` (
  `id`         VARCHAR(191) NOT NULL,
  `full_text`  LONGTEXT     NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt`  DATETIME(3)  NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add posts table
CREATE TABLE IF NOT EXISTS `posts` (
  `id`         VARCHAR(191) NOT NULL,
  `content`    LONGTEXT     NOT NULL,
  `image_url`  VARCHAR(500) NULL,
  `video_url`  VARCHAR(500) NULL,
  `author_id`  VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `posts_author_id_idx` (`author_id`),
  CONSTRAINT `posts_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add post_likes table
CREATE TABLE IF NOT EXISTS `post_likes` (
  `id`         VARCHAR(191) NOT NULL,
  `post_id`    VARCHAR(191) NOT NULL,
  `user_id`    VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `post_likes_post_id_user_id_key` (`post_id`, `user_id`),
  INDEX `post_likes_user_id_idx` (`user_id`),
  CONSTRAINT `post_likes_post_id_fkey`  FOREIGN KEY (`post_id`)  REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `post_likes_user_id_fkey`  FOREIGN KEY (`user_id`)  REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add post_comments table
CREATE TABLE IF NOT EXISTS `post_comments` (
  `id`         VARCHAR(191) NOT NULL,
  `post_id`    VARCHAR(191) NOT NULL,
  `user_id`    VARCHAR(191) NOT NULL,
  `content`    LONGTEXT     NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `post_comments_post_id_idx` (`post_id`),
  INDEX `post_comments_user_id_idx` (`user_id`),
  CONSTRAINT `post_comments_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `post_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
