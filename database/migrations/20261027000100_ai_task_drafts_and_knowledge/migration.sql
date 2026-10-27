-- CreateTable
CREATE TABLE `ai_task_drafts` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `payload` JSON NOT NULL,
    `expires_at` DATETIME(6) NOT NULL,
    `committed_at` DATETIME(6) NULL,
    `task_id` CHAR(36) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL,

    INDEX `ai_task_drafts_organization_id_user_id_expires_at_idx`(`organization_id`, `user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_knowledge_documents` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `indexed_by_user_id` CHAR(36) NOT NULL,
    `source_checksum` CHAR(64) NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL,

    UNIQUE INDEX `ai_knowledge_documents_organization_id_id_key`(`organization_id`, `id`),
    UNIQUE INDEX `ai_knowledge_documents_organization_id_file_id_key`(`organization_id`, `file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_knowledge_chunks` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `ordinal` INTEGER UNSIGNED NOT NULL,
    `page` INTEGER UNSIGNED NOT NULL,
    `content` TEXT NOT NULL,

    INDEX `ai_knowledge_chunks_organization_id_document_id_idx`(`organization_id`, `document_id`),
    UNIQUE INDEX `ai_knowledge_chunks_document_id_ordinal_key`(`document_id`, `ordinal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_task_drafts` ADD CONSTRAINT `ai_task_drafts_organization_id_user_id_fkey` FOREIGN KEY (`organization_id`, `user_id`) REFERENCES `organization_memberships`(`organization_id`, `user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ai_task_drafts` ADD CONSTRAINT `ai_task_drafts_organization_id_task_id_fkey` FOREIGN KEY (`organization_id`, `task_id`) REFERENCES `tasks`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ai_knowledge_documents` ADD CONSTRAINT `ai_knowledge_documents_organization_id_file_id_fkey` FOREIGN KEY (`organization_id`, `file_id`) REFERENCES `file_objects`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ai_knowledge_documents` ADD CONSTRAINT `ai_knowledge_documents_organization_id_indexed_by_user_id_fkey` FOREIGN KEY (`organization_id`, `indexed_by_user_id`) REFERENCES `organization_memberships`(`organization_id`, `user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ai_knowledge_chunks` ADD CONSTRAINT `ai_knowledge_chunks_organization_id_document_id_fkey` FOREIGN KEY (`organization_id`, `document_id`) REFERENCES `ai_knowledge_documents`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
