export interface AttachmentInput { name?: string; mime: string; bytes: ArrayBuffer; localUrl?: string }
export interface PickedAttachment { name?: string; mime: string; size: number; read(): Promise<ArrayBuffer> }
export declare function hasImagePreview(mime: string): boolean;
export declare function attachmentLimits(capabilities?: any): { imageBytes: number; imageCount: number; fileBytes: number; fileCount: number };
export declare function uploadAttachments(sessionId: string, attachments: AttachmentInput[], options?: { signal?: AbortSignal; capabilities?: any }): Promise<{ blocks: any[]; uploaded: any[] }>;
