export interface FileRef {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    url?: string;
}
export interface PresignedUploadIntent {
    uploadUrl: string;
    expiresAt: string;
    headers?: Record<string, string>;
}
//# sourceMappingURL=index.d.ts.map