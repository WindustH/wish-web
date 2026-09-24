export interface AttachmentInput { kind: 'image' | 'file'; pastedText?: boolean; name?: string; placeholder?: string; mime: string; bytes: ArrayBuffer; localUrl?: string }
export interface PickedAttachment { kind: 'image' | 'file'; pastedText?: boolean; name?: string; mime: string; size: number; read(): Promise<ArrayBuffer> }
export declare function hasImagePreview(mime: string): boolean;
export declare function attachmentLimits(capabilities?: any): { imageBytes: number; imageCount: number; fileBytes: number; fileCount: number };
export declare function attachmentDraftsFor<T extends AttachmentInput = AttachmentInput>(sessionId: string): T[];
export declare function saveAttachmentDrafts<T extends AttachmentInput>(sessionId: string, attachments: readonly T[]): void;
export declare function uploadAttachments(sessionId: string, attachments: AttachmentInput[], options?: { signal?: AbortSignal; capabilities?: any }): Promise<{ blocks: any[]; uploaded: any[] }>;
