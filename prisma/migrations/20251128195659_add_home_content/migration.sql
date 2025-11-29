-- CreateTable
CREATE TABLE `home_content` (
    `id` VARCHAR(191) NOT NULL,
    `hero_title` VARCHAR(200) NOT NULL,
    `hero_subtitle` VARCHAR(500) NOT NULL,
    `hero_cta_text` VARCHAR(50) NOT NULL DEFAULT 'Get Started',
    `hero_cta_link` VARCHAR(200) NOT NULL DEFAULT '/events',
    `featured_event_ids` JSON NOT NULL,
    `show_past_events` BOOLEAN NOT NULL DEFAULT true,
    `stats_enabled` BOOLEAN NOT NULL DEFAULT true,
    `total_events` INTEGER NOT NULL DEFAULT 0,
    `total_members` INTEGER NOT NULL DEFAULT 0,
    `active_projects` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
