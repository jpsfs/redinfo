import { Module } from '@nestjs/common';
import { ATTACHMENT_STORAGE, DiskAttachmentStorage } from './attachment-storage';

/**
 * The one file-storage pipeline in the app, shared by event report
 * attachments, certification documents and profile photos.
 *
 * `@Global` would reach further than needed; every module that stores files
 * imports this one explicitly instead.
 */
@Module({
  providers: [
    // Behind a token so a test can hand a service an in-memory store instead
    // of writing to the repository.
    //
    // A factory rather than `useClass`: the constructor takes the uploads
    // root as a plain string with a default, and `useClass` would have Nest
    // try to inject that string and fail to start.
    {
      provide: ATTACHMENT_STORAGE,
      useFactory: () => new DiskAttachmentStorage(process.env.ATTACHMENTS_DIR),
    },
  ],
  exports: [ATTACHMENT_STORAGE],
})
export class StorageModule {}
