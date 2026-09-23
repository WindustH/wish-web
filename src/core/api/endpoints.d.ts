// Typed surface for the endpoint functions (business logic stays .js).
export declare function sessionGet(id: string, opts?: any): Promise<any>;
export declare function sessionUsage(id: string): Promise<any>;
export declare function blobUrl(sha256: string): string;
export declare function sessionCreate(body: any): Promise<any>;
export declare function sessionRename(id: string, name: string): Promise<any>;
export declare function sessionUpdateMeta(id: string, metadata: any, ifMatchRevision?: any, opts?: any): Promise<any>;
export declare function sessionDelete(id: string, opts?: any): Promise<any>;
export declare function sessionUpdateModel(id: string, body: any, ifMatchRevision?: any, opts?: any): Promise<any>;
export declare function historySearch(id: string, params: any, opts?: any): Promise<any>;
export declare function sessionInterrupt(id: string): Promise<any>;
export declare function sessionCompact(id: string): Promise<any>;
export declare function daemonStatus(opts?: { signal?: AbortSignal }): Promise<any>;
export declare function providerConfigs(opts?: any): Promise<any>;
export declare function providerModels(id: string, opts?: any): Promise<any>;
export declare function uploadSessionBlob(sid: string, bytes: ArrayBuffer | Uint8Array, opts?: any): Promise<any>;
export declare function uploadSessionImage(sid: string, bytes: ArrayBuffer | Uint8Array, opts?: any): Promise<any>;
export declare function sessionCapabilities(id: string, opts?: any): Promise<any>;

export declare function messageSend(id: string, body: any, opts?: any): Promise<any>;
export declare function usageSeries(sessionId: string | undefined, params: import('../usage/types').SeriesQuery, opts?: { signal?: AbortSignal }): Promise<import('../usage/types').UsageSeriesResponse>;
export declare function usageDaily(sessionId: string | undefined, params: import('../usage/types').DailyQuery, opts?: { signal?: AbortSignal }): Promise<import('../usage/types').UsageDailyResponse>;

export declare function configEffective(): Promise<{ defaults: {provider:string;model:string;reasoning?:{effort?:string};instructions:string;cwd:string;shell:boolean} }>;

export declare function sessionsList(params: { limit?: number; order?: string }): Promise<{ items: any[] }>;

export declare function rememberDefaultModel(value: { provider: string; model: string; reasoning_effort?: string }): Promise<void>;

export declare function historyPage(id: string, params: any, opts?: any): Promise<any>;
export declare function deliveriesList(id: string, params?: any, opts?: any): Promise<any>;
export declare function daemonVersion(opts?: { signal?: AbortSignal }): Promise<{ name: string; version: string }>;
export declare function usageTotals(opts?: { signal?: AbortSignal }): Promise<import('../state/statsSlice').UsageSnapshot>;
export declare function storageStatus(opts?: { signal?: AbortSignal }): Promise<import('../state/statsSlice').StorageSnapshot>;

export declare function sessionClearContext(id:string):Promise<any>;
export declare function sessionFork(id:string):Promise<any>;
export declare function moveQueuedInput(id: string, entry: string, before: string | number | null): Promise<any>;
export declare function cancelQueuedInput(id:string,entry:string):Promise<any>;
