// Typed surface for the endpoint functions (business logic stays .js).
export declare function sessionGet(id: string, opts?: any): Promise<any>;
export declare function sessionCreate(body: any): Promise<any>;
export declare function sessionRename(id: string, name: string): Promise<any>;
export declare function sessionUpdateMeta(id: string, metadata: any, ifMatchRevision?: any, opts?: any): Promise<any>;
export declare function sessionDelete(id: string, opts?: any): Promise<any>;
export declare function sessionUpdateModel(id: string, body: any, ifMatchRevision?: any, opts?: any): Promise<any>;
export declare function historySearch(id: string, params: any, opts?: any): Promise<any>;
export declare function sessionInterrupt(id: string): Promise<any>;
export declare function sessionCompact(id: string): Promise<any>;
export declare function sessionPrune(id: string, body?: any): Promise<any>;
export declare function sessionRuns(id: string, params?: any, opts?: any): Promise<any>;
export declare function daemonStatus(): Promise<any>;
export declare function providerConfigs(opts?: any): Promise<any>;
export declare function providerModels(id: string, opts?: any): Promise<any>;
export declare function streamingGet(opts?: any): Promise<any>;
export declare function streamingPut(enabled: boolean, opts?: any): Promise<any>;
export declare function uploadSessionImage(sid: string, bytes: ArrayBuffer | Uint8Array, mime: string, opts?: any): Promise<any>;
export declare function sessionCapabilities(id: string, opts?: any): Promise<any>;
